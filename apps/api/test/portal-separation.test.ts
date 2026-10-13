import { schema } from "@g3/db";
import { generate } from "otplib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/lib/crypto.ts";
import { AUDIENCE, signJwt } from "../src/lib/jwt.ts";
import { call, config, ownerConn, pgError, platformConn, signupOrg, uniq } from "./helpers.ts";

const password = "AdminPassword123!";
let adminEmail: string;
let adminToken: string;
let tenant: Awaited<ReturnType<typeof signupOrg>>;

async function adminLogin() {
  const step1 = await call("POST", "/admin-api/v1/auth/login", { body: { email: adminEmail, password } });
  expect(step1.status).toBe(200);
  return step1.json as { status: "totp" | "enroll"; challenge: string; otpauthUrl?: string };
}

beforeAll(async () => {
  adminEmail = `${uniq("root")}@g3leads.test`;
  await ownerConn.db.insert(schema.platformAdmins).values({
    email: adminEmail,
    name: "Root",
    passwordHash: await hashPassword(password),
  });
  tenant = await signupOrg("portal");
});
afterAll(async () => {
  await platformConn.close();
  await ownerConn.close();
});

describe("super-admin login requires TOTP", () => {
  it("first login forces enrolment, and the MFA challenge is not an access token", async () => {
    const step1 = await adminLogin();
    expect(step1.status).toBe("enroll");
    expect(step1.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);

    const asAccess = await call("GET", "/admin-api/v1/tenants", { token: step1.challenge });
    expect(asAccess.status).toBe(401);

    const bad = await call("POST", "/admin-api/v1/auth/totp", { body: { challenge: step1.challenge, code: "000000" } });
    expect(bad.status).toBe(401);

    const secret = new URL(step1.otpauthUrl!).searchParams.get("secret")!;
    const ok = await call("POST", "/admin-api/v1/auth/totp", {
      body: { challenge: step1.challenge, code: await generate({ secret }) },
    });
    expect(ok.status).toBe(200);
    adminToken = ok.json.accessToken;
    expect(ok.headers.get("set-cookie")).toMatch(/g3_admin_at=.*HttpOnly/i);

    const again = await adminLogin();
    expect(again.status).toBe("totp");
  });

  it("admin can list and suspend tenants; suspension locks tenant users out", async () => {
    const list = await call("GET", "/admin-api/v1/tenants", { token: adminToken });
    expect(list.status).toBe(200);
    expect(list.json.some((t: { id: string }) => t.id === tenant.orgId)).toBe(true);

    expect((await call("POST", `/admin-api/v1/tenants/${tenant.orgId}/suspend`, { token: adminToken })).status).toBe(
      200,
    );
    expect((await call("GET", "/api/v1/me", { token: tenant.token })).status).toBe(403);
    const login = await call("POST", "/api/v1/auth/login", { body: { email: tenant.email, password: "Password123!" } });
    expect(login.status).toBe(403);

    await call("POST", `/admin-api/v1/tenants/${tenant.orgId}/reactivate`, { token: adminToken });
    expect((await call("GET", "/api/v1/me", { token: tenant.token })).status).toBe(200);

    const audit = await call("GET", "/admin-api/v1/audit-log", { token: adminToken });
    expect(audit.json.map((r: { action: string }) => r.action)).toEqual(
      expect.arrayContaining(["tenant.suspend", "tenant.reactivate"]),
    );
  });
});

describe("portal tokens are not interchangeable", () => {
  it("a super-admin token is rejected by every tenant endpoint", async () => {
    for (const path of ["/api/v1/me", "/api/v1/users", "/api/v1/contacts", "/api/v1/dashboards/admin"]) {
      expect((await call("GET", path, { token: adminToken })).status).toBe(401);
    }
  });

  it("a tenant Org Admin token is rejected by every super-admin endpoint", async () => {
    for (const path of ["/admin-api/v1/me", "/admin-api/v1/tenants", "/admin-api/v1/metrics"]) {
      expect((await call("GET", path, { token: tenant.token })).status).toBe(401);
    }
  });

  it("a forged token with the right audience but the wrong secret is rejected", async () => {
    const forgedAdmin = await signJwt(
      config.tenantJwtSecret,
      AUDIENCE.admin,
      { sub: "x", email: "x", mfa: true },
      "5m",
    );
    expect((await call("GET", "/admin-api/v1/tenants", { token: forgedAdmin })).status).toBe(401);

    const me = await call("GET", "/api/v1/me", { token: tenant.token });
    const forgedTenant = await signJwt(
      config.adminJwtSecret,
      AUDIENCE.tenant,
      { sub: me.json.user.id, org: me.json.org.id, role: me.json.role.id, pos: null },
      "5m",
    );
    expect((await call("GET", "/api/v1/me", { token: forgedTenant })).status).toBe(401);
  });

  it("a token signed with the admin secret but tenant audience is rejected by admin API", async () => {
    const wrongAud = await signJwt(config.adminJwtSecret, AUDIENCE.tenant, { sub: "x", email: "x", mfa: true }, "5m");
    expect((await call("GET", "/admin-api/v1/tenants", { token: wrongAud })).status).toBe(401);
  });

  it("the platform DB role cannot read tenant business data", async () => {
    expect(await pgError(platformConn.db.select().from(schema.contacts))).toMatch(/permission denied/);
  });
});
