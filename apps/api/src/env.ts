export interface Config {
  tenantJwtSecret: string;
  adminJwtSecret: string;
  adminIpAllowlist: string[];
  secureCookies: boolean;
  webOrigin: string;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

export function loadConfig(): Config {
  const cfg: Config = {
    tenantJwtSecret: required("TENANT_JWT_SECRET"),
    adminJwtSecret: required("ADMIN_JWT_SECRET"),
    adminIpAllowlist: (process.env.ADMIN_IP_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    secureCookies: process.env.NODE_ENV === "production",
    webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  };
  if (cfg.tenantJwtSecret === cfg.adminJwtSecret) {
    throw new Error("TENANT_JWT_SECRET and ADMIN_JWT_SECRET must differ");
  }
  return cfg;
}
