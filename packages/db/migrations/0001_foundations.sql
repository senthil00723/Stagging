-- G3Leads Phase 0 foundations.
-- Tenant isolation is enforced by PostgreSQL Row-Level Security, not only by
-- application filters. The tenant API connects as g3_app (subject to RLS) and
-- sets `app.org_id` per transaction. The platform admin API connects as
-- g3_platform (BYPASSRLS) and only ever touches platform tables + read-only
-- tenant metadata.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Helper: current tenant from the transaction-local setting.
CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.org_id', true), '')::uuid
$$;

-- ── Platform (never tenant-scoped, never joined into tenant queries) ───────
CREATE TABLE platform_admins (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  totp_secret   text,              -- set once enrollment is confirmed
  totp_pending  text,              -- secret awaiting first verification
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE platform_audit_log (
  id         bigserial PRIMARY KEY,
  admin_id   uuid REFERENCES platform_admins(id),
  action     text NOT NULL,
  target     text,
  meta       jsonb NOT NULL DEFAULT '{}',
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Tenant tables ──────────────────────────────────────────────────────────
CREATE TABLE organizations (
  id         uuid PRIMARY KEY,
  name       text NOT NULL,
  slug       citext NOT NULL UNIQUE,
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key           text,               -- stable key for seeded roles, null for custom
  name          text NOT NULL,
  landing_route text NOT NULL,
  permissions   text[] NOT NULL DEFAULT '{}',
  is_system     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE positions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email         citext NOT NULL,
  name          text NOT NULL,
  password_hash text NOT NULL,
  role_id       uuid NOT NULL REFERENCES roles(id),
  position_id   uuid REFERENCES positions(id),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, email)
);

CREATE TABLE invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email       citext NOT NULL,
  role_id     uuid NOT NULL REFERENCES roles(id),
  position_id uuid REFERENCES positions(id),
  token_hash  text NOT NULL UNIQUE,
  invited_by  uuid REFERENCES users(id),
  expires_at  timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id   uuid NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contacts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  name       text NOT NULL,
  email      citext,
  phone      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contacts_org_owner_idx ON contacts (org_id, owner_id);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id    uuid,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text,
  old_value   jsonb,
  new_value   jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_org_created_idx ON audit_log (org_id, created_at DESC);

-- ── Row-Level Security ─────────────────────────────────────────────────────
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organizations
  USING (id = app_current_org()) WITH CHECK (id = app_current_org());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['roles','positions','users','invitations','refresh_tokens','contacts','audit_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org())',
      t);
  END LOOP;
END $$;

-- ── Pre-tenant lookups ─────────────────────────────────────────────────────
-- Login and invite acceptance happen before we know the tenant, so they go
-- through narrow SECURITY DEFINER functions owned by g3_auth (BYPASSRLS,
-- NOLOGIN) instead of granting g3_app any cross-tenant read.
CREATE FUNCTION auth_find_login(p_email citext, p_slug citext)
RETURNS TABLE (user_id uuid, org_id uuid, org_slug citext, org_status text, password_hash text, user_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.org_id, o.slug, o.status, u.password_hash, u.status
  FROM users u JOIN organizations o ON o.id = u.org_id
  WHERE u.email = p_email AND (p_slug IS NULL OR o.slug = p_slug)
$$;

CREATE FUNCTION auth_find_invitation(p_token_hash text)
RETURNS TABLE (invitation_id uuid, org_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.org_id FROM invitations i
  WHERE i.token_hash = p_token_hash AND i.accepted_at IS NULL AND i.expires_at > now()
$$;

CREATE FUNCTION auth_slug_taken(p_slug citext) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM organizations WHERE slug = p_slug)
$$;

CREATE FUNCTION auth_org_status(p_org uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT status FROM organizations WHERE id = p_org
$$;
