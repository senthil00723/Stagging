-- Tenant API role: tenant tables only, always under RLS. No platform tables.
GRANT USAGE ON SCHEMA public TO g3_app, g3_platform, g3_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  organizations, roles, positions, users, invitations, refresh_tokens, contacts, audit_log
  TO g3_app;
GRANT USAGE ON SEQUENCE audit_log_id_seq TO g3_app;
REVOKE ALL ON platform_admins, platform_audit_log FROM g3_app;

-- Platform role: platform tables + tenant metadata. It cannot read contacts.
GRANT SELECT, INSERT, UPDATE ON platform_admins TO g3_platform;
GRANT SELECT, INSERT ON platform_audit_log TO g3_platform;
GRANT USAGE ON SEQUENCE platform_audit_log_id_seq TO g3_platform;
GRANT SELECT, UPDATE (status) ON organizations TO g3_platform;
GRANT SELECT (id, org_id) ON users TO g3_platform;

-- Pre-tenant lookup functions run as g3_auth (BYPASSRLS) with minimal reads.
GRANT SELECT ON organizations, users, invitations TO g3_auth;
ALTER FUNCTION auth_find_login(citext, citext) OWNER TO g3_auth;
ALTER FUNCTION auth_find_invitation(text) OWNER TO g3_auth;
ALTER FUNCTION auth_slug_taken(citext) OWNER TO g3_auth;
ALTER FUNCTION auth_org_status(uuid) OWNER TO g3_auth;
REVOKE ALL ON FUNCTION auth_find_login(citext, citext), auth_find_invitation(text),
  auth_slug_taken(citext), auth_org_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_find_login(citext, citext), auth_find_invitation(text),
  auth_slug_taken(citext), auth_org_status(uuid) TO g3_app;
