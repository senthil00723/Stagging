# G3Leads architecture (Phase 0)

## Multi-tenancy: PostgreSQL Row-Level Security

Every tenant table has `org_id` and a `tenant_isolation` policy:

```sql
USING (org_id = app_current_org()) WITH CHECK (org_id = app_current_org())
```

`app_current_org()` reads the transaction-local setting `app.org_id`. RLS is
`FORCE`d, so it applies even to the table owner.

There are three database roles, each with one job:

| Role | Used by | RLS | Can see |
|---|---|---|---|
| `g3_app` | tenant API (`/api/v1`) | **enforced** | tenant tables, only for the org set in `app.org_id` |
| `g3_platform` | super-admin API (`/admin-api/v1`) | bypass | platform tables, org metadata, user ids. **No** contacts or business data |
| `g3_auth` | `SECURITY DEFINER` functions only (NOLOGIN) | bypass | the columns needed for login and invite lookups |

Tenant code reaches the database only through `withTenant(db, orgId, fn)`.
That opens a transaction, runs `set_config('app.org_id', orgId, true)` and
passes the transaction to `fn`. If someone forgets a `WHERE org_id = …`
filter, the query returns only the current tenant's rows. If the context is
missing entirely, it returns nothing.

Login and invite acceptance happen before the tenant is known. They go
through narrow `SECURITY DEFINER` functions (`auth_find_login`,
`auth_find_invitation`, `auth_slug_taken`, `auth_org_status`), so `g3_app`
never needs a cross-tenant read grant.

## Authentication: three separate concerns

1. **Super-admin portal** (`apps/admin` → `/admin-api/v1`)
   - Backed by the `platform_admins` table, never the tenant `users` table.
   - Has its own `ADMIN_JWT_SECRET` and audience `g3leads:platform-admin`, and
     a cookie scoped to `/admin-api` with `SameSite=Strict`.
   - TOTP is mandatory. The first login forces enrolment with a QR code. The
     password step only returns a 5-minute challenge token with a different
     audience (`…:mfa`), which the API does not accept as an access token.
   - Optional `ADMIN_IP_ALLOWLIST`.
   - Every action is written to `platform_audit_log`.
2. **Tenant login** (`apps/web` → `/api/v1/auth/*`)
   - One login page for everyone. The tenant is resolved from the email; if
     the email belongs to several workspaces, the user also gives the
     workspace slug.
   - The access JWT (15 min) carries `sub` (user_id), `org`, `role` and `pos`
     (position).
   - The refresh token (30 days) is opaque and stored hashed. It is rotated
     on every use, and reusing an old one revokes the whole token family.
   - Both tokens are httpOnly cookies. A `Bearer` header is also accepted,
     for SDK and mobile clients.
3. **Role-based routing**
   - `roles.landing_route` and `roles.permissions` are tenant data. Admins can
     create roles such as "Regional Sales Head" in the UI.
   - The SPA's `<RequireRole permission>` is UX only. On every request the
     API re-loads the user's role from the DB and checks permissions, so a
     role change applies to existing tokens straight away.
   - Positions are a separate, tenant-editable label used for display and the
     org chart.

## Other Phase 0 decisions

- **API: Hono rather than NestJS/Express.** Hono is small and fast and runs on
  Node, Bun or edge runtimes. `@hono/zod-openapi` gives typed routes and
  generates the OpenAPI spec from the same Zod schemas the frontends share.
- **ORM: Drizzle rather than Prisma.** Drizzle works with `SET LOCAL`-style
  transactions and raw SQL, which RLS needs. The SQL migrations are the source
  of truth because policies, roles and functions live there, and the Drizzle
  schema mirrors them.
- **CSRF.** Defended by `SameSite` cookies, JSON-only endpoints and Hono's
  `csrf()` origin check.
- **Rate limiting.** Auth endpoints use an in-memory fixed window for now.
  Phase 5 moves it to Redis at the gateway.
- **i18n.** Translations are JSON resources (`apps/web/src/i18n/*.json`), so
  more Indian languages can be added without code changes.

## What Phase 0 does not include yet

These are planned for later phases:

- Invitation emails. The API returns the invite link and the admin copies it.
  Email delivery comes with the BullMQ worker.
- SSO (Google, Microsoft, SAML) and TOTP for tenant users.
- Impersonation, feature flags and billing in the super-admin portal
  (Phase 5).
- The customization engine (CustomObject, CustomField, View, Workflow),
  Phase 2. `contacts` is a temporary fixed table that exists to prove
  isolation and record-level scoping. In Phase 1 it moves onto the
  object/field engine.

## Roadmap

See Section 11 of [the master spec](g3leads-master-prompt.md).

| Phase | Scope |
|---|---|
| 1 | Core CRM (contacts, companies, deals, pipelines), table + kanban, search, dashboard widgets |
| 2 | Customization engine: object/field/view builder, workflow builder, SDK |
| 3 | WhatsApp, SMS and telephony adapters, Razorpay/Cashfree, GST invoicing |
| 4 | Time-based workflows, AI provider abstraction, advanced reports |
| 5 | SaaS billing, super-admin hardening, white-label |
| 6 | Importers, PWA/mobile, marketplace |
