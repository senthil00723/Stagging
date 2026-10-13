import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, app, call, signupOrg, tenantConn } from "./helpers.ts";

let org: Awaited<ReturnType<typeof signupOrg>>;
let manager: { token: string; landingRoute: string };
let rep: { token: string; landingRoute: string };
let rep2: { token: string; landingRoute: string };

beforeAll(async () => {
  org = await signupOrg("rbac");
  manager = await addMember(org.token, "Sales Manager", `manager@${org.slug}.test`);
  rep = await addMember(org.token, "Sales Executive", `rep@${org.slug}.test`);
  rep2 = await addMember(org.token, "Sales Executive", `rep2@${org.slug}.test`);
});
afterAll(() => tenantConn.close());

describe("one login page, role-based landing", () => {
  it("three roles logging in via the same endpoint land on three dashboards", async () => {
    const landing: Record<string, string> = {};
    for (const who of ["owner", "manager", "rep"]) {
      const res = await call("POST", "/api/v1/auth/login", {
        body: { email: `${who}@${org.slug}.test`, password: "Password123!" },
      });
      expect(res.status).toBe(200);
      landing[who] = res.json.landingRoute;
    }
    expect(landing).toEqual({ owner: "/admin", manager: "/team", rep: "/my-workspace" });
  });

  it("dashboards are enforced server-side, not just hidden in the UI", async () => {
    const matrix: [string, string, number][] = [
      [org.token, "admin", 200],
      [org.token, "team", 200],
      [manager.token, "team", 200],
      [manager.token, "admin", 403],
      [manager.token, "invoicing", 403],
      [rep.token, "my-workspace", 200],
      [rep.token, "team", 403],
      [rep.token, "admin", 403],
      [rep.token, "inbox", 403],
    ];
    for (const [token, area, status] of matrix) {
      expect((await call("GET", `/api/v1/dashboards/${area}`, { token })).status, `${area}`).toBe(status);
    }
  });

  it("admin-only APIs reject a rep who types the URL directly", async () => {
    expect((await call("GET", "/api/v1/users", { token: rep.token })).status).toBe(403);
    expect((await call("GET", "/api/v1/roles", { token: rep.token })).status).toBe(403);
    expect((await call("GET", "/api/v1/audit-log", { token: manager.token })).status).toBe(403);
    expect(
      (
        await call("POST", "/api/v1/invitations", {
          token: rep.token,
          body: { email: "x@y.test", roleId: crypto.randomUUID() },
        })
      ).status,
    ).toBe(403);
  });

  it("record-level scoping: reps see only their own contacts, managers see all", async () => {
    await call("POST", "/api/v1/contacts", { token: rep.token, body: { name: "Rep One Lead" } });
    await call("POST", "/api/v1/contacts", { token: rep2.token, body: { name: "Rep Two Lead" } });
    const mine = await call("GET", "/api/v1/contacts", { token: rep.token });
    expect(mine.json.map((c: { name: string }) => c.name)).toEqual(["Rep One Lead"]);
    const all = await call("GET", "/api/v1/contacts", { token: manager.token });
    expect(all.json.map((c: { name: string }) => c.name).sort()).toEqual(["Rep One Lead", "Rep Two Lead"]);
  });

  it("a tenant admin can invent a new role without code and it takes effect immediately", async () => {
    const created = await call("POST", "/api/v1/roles", {
      token: org.token,
      body: {
        name: "Regional Sales Head",
        landingRoute: "/team",
        permissions: ["team.view", "contacts.read.all", "contacts.write"],
      },
    });
    expect(created.status).toBe(201);
    const head = await addMember(org.token, "Regional Sales Head", `head@${org.slug}.test`);
    expect(head.landingRoute).toBe("/team");
    expect((await call("GET", "/api/v1/dashboards/team", { token: head.token })).status).toBe(200);
    expect((await call("GET", "/api/v1/dashboards/admin", { token: head.token })).status).toBe(403);

    // Demote the rep: the change applies to their existing token immediately.
    const users = await call("GET", "/api/v1/users", { token: org.token });
    const repUser = users.json.find((u: { email: string }) => u.email === `rep@${org.slug}.test`);
    await call("PATCH", `/api/v1/users/${repUser.id}`, { token: org.token, body: { roleId: created.json.id } });
    expect((await call("GET", "/api/v1/dashboards/team", { token: rep.token })).status).toBe(200);
  });
});

describe("sessions", () => {
  const cookieFrom = (h: Headers, name: string) =>
    h
      .getSetCookie()
      .find((c) => c.startsWith(`${name}=`))
      ?.split(";")[0];

  it("sets httpOnly cookies, rotates refresh tokens and revokes the family on reuse", async () => {
    const login = await call("POST", "/api/v1/auth/login", {
      body: { email: org.email, password: "Password123!" },
    });
    const cookies = login.headers.getSetCookie();
    expect(cookies.every((c) => /HttpOnly/i.test(c))).toBe(true);
    const rt1 = cookieFrom(login.headers, "g3_rt")!;

    const r2 = await call("POST", "/api/v1/auth/refresh", { cookie: rt1 });
    expect(r2.status).toBe(200);
    const rt2 = cookieFrom(r2.headers, "g3_rt")!;
    expect(rt2).not.toBe(rt1);

    // Replaying the old token is treated as theft: both old and new die.
    expect((await call("POST", "/api/v1/auth/refresh", { cookie: rt1 })).status).toBe(401);
    expect((await call("POST", "/api/v1/auth/refresh", { cookie: rt2 })).status).toBe(401);
  });

  it("rejects bad credentials and validates input", async () => {
    expect((await call("POST", "/api/v1/auth/login", { body: { email: org.email, password: "nope" } })).status).toBe(
      401,
    );
    expect((await call("POST", "/api/v1/auth/signup", { body: { slug: "x" } })).status).toBe(400);
    expect((await call("GET", "/api/v1/me")).status).toBe(401);
  });
});

describe("CSRF", () => {
  it("rejects a cross-site form POST", async () => {
    const res = await app.request("/api/v1/auth/logout", {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" },
      body: "a=b",
    });
    expect(res.status).toBe(403);
  });
});
