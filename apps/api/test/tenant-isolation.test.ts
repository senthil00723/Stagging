import { schema, sql, withTenant } from "@g3/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, call, pgError, signupOrg, tenantConn } from "./helpers.ts";

type Org = Awaited<ReturnType<typeof signupOrg>>;
let a: Org;
let b: Org;

beforeAll(async () => {
  a = await signupOrg("alpha");
  b = await signupOrg("bravo");
  await call("POST", "/api/v1/contacts", { token: a.token, body: { name: "Alpha Customer" } });
  await call("POST", "/api/v1/contacts", { token: b.token, body: { name: "Bravo Customer" } });
  await addMember(a.token, "Sales Executive", `rep@${a.slug}.test`);
});
afterAll(() => tenantConn.close());

describe("tenant isolation (API)", () => {
  it("each org only sees its own contacts, users and roles", async () => {
    const ca = await call("GET", "/api/v1/contacts", { token: a.token });
    const cb = await call("GET", "/api/v1/contacts", { token: b.token });
    expect(ca.json.map((c: { name: string }) => c.name)).toEqual(["Alpha Customer"]);
    expect(cb.json.map((c: { name: string }) => c.name)).toEqual(["Bravo Customer"]);

    const ub = await call("GET", "/api/v1/users", { token: b.token });
    expect(ub.json).toHaveLength(1);
    expect(ub.json[0].email).toBe(b.email);

    const ra = await call("GET", "/api/v1/roles", { token: a.token });
    const rb = await call("GET", "/api/v1/roles", { token: b.token });
    const idsA = new Set(ra.json.map((r: { id: string }) => r.id));
    expect(rb.json.some((r: { id: string }) => idsA.has(r.id))).toBe(false);
  });

  it("cannot invite into another org's role", async () => {
    const ra = await call("GET", "/api/v1/roles", { token: a.token });
    const res = await call("POST", "/api/v1/invitations", {
      token: b.token,
      body: { email: "sneaky@bravo.test", roleId: ra.json[0].id },
    });
    expect(res.status).toBe(400);
  });

  it("cannot edit a user from another org", async () => {
    const rb = await call("GET", "/api/v1/roles", { token: b.token });
    const res = await call("PATCH", `/api/v1/users/${a.userId}`, {
      token: b.token,
      body: { roleId: rb.json[0].id },
    });
    expect(res.status).toBe(404);
  });
});

describe("tenant isolation (PostgreSQL RLS, bypassing the API)", () => {
  const db = () => tenantConn.db;

  it("as g3_app with org B's context, org A's rows are invisible", async () => {
    const rows = await withTenant(db(), b.orgId, (tx) => tx.select().from(schema.contacts));
    expect(rows.every((r) => r.orgId === b.orgId)).toBe(true);
    const users = await withTenant(db(), b.orgId, (tx) => tx.select().from(schema.users));
    expect(users.every((u) => u.orgId === b.orgId)).toBe(true);
    const orgs = await withTenant(db(), b.orgId, (tx) => tx.select().from(schema.organizations));
    expect(orgs.map((o) => o.id)).toEqual([b.orgId]);
  });

  it("with no tenant context set, g3_app sees nothing at all", async () => {
    const [{ n }] = (await db().execute(sql`select count(*)::int as n from contacts`)) as unknown as [{ n: number }];
    expect(n).toBe(0);
    const [{ u }] = (await db().execute(sql`select count(*)::int as u from users`)) as unknown as [{ u: number }];
    expect(u).toBe(0);
  });

  it("writing a row tagged with another org is rejected by WITH CHECK", async () => {
    const msg = await pgError(
      withTenant(db(), b.orgId, (tx) => tx.insert(schema.contacts).values({ orgId: a.orgId, name: "smuggled" })),
    );
    expect(msg).toMatch(/row-level security/);
  });

  it("g3_app cannot read platform tables", async () => {
    expect(await pgError(db().execute(sql`select * from platform_admins`))).toMatch(/permission denied/);
  });
});
