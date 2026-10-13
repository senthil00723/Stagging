-- Database roles. Passwords here are for local dev only; production roles are
-- provisioned by infra with secrets from the vault (see docs/architecture.md).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'g3_app') THEN
    CREATE ROLE g3_app LOGIN PASSWORD 'g3_app_dev' NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'g3_platform') THEN
    CREATE ROLE g3_platform LOGIN PASSWORD 'g3_platform_dev' BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'g3_auth') THEN
    CREATE ROLE g3_auth NOLOGIN BYPASSRLS;
  END IF;
END $$;
