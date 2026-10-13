import { createDb } from "@g3/db";
import { createApp } from "../src/app.ts";
import type { Config } from "../src/env.ts";

const base = `${process.env.TEST_DATABASE_HOST ?? "localhost:5432"}/g3leads_test`;
export const tenantConn = createDb(`postgres://g3_app:g3_app_dev@${base}`, 4);
export const platformConn = createDb(`postgres://g3_platform:g3_platform_dev@${base}`, 2);
export const ownerConn = createDb(process.env.TEST_MIGRATION_DATABASE_URL ?? `postgres://postgres:postgres@${base}`, 2);

export const config: Config = {
  tenantJwtSecret: "test-tenant-secret-0123456789abcdef0123",
  adminJwtSecret: "test-admin-secret-0123456789abcdef01234",
  adminIpAllowlist: [],
  secureCookies: false,
  webOrigin: "http://localhost:5173",
};

export const app = createApp({ db: tenantConn.db, platformDb: platformConn.db, config });

export async function call(
  method: string,
  path: string,
  opts: { body?: unknown; token?: string; cookie?: string } = {},
) {
  // Browsers send Origin on every POST; the CSRF guard checks it.
  const headers: Record<string, string> = { origin: config.webOrigin };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await app.request(path, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  // biome-ignore lint/suspicious/noExplicitAny: test convenience
  const json: any = text ? JSON.parse(text) : null;
  return { status: res.status, json, headers: res.headers };
}

let n = 0;
export const uniq = (p: string) => `${p}-${Date.now().toString(36)}-${n++}`;

export async function signupOrg(prefix: string) {
  const slug = uniq(prefix);
  const email = `owner@${slug}.test`;
  const res = await call("POST", "/api/v1/auth/signup", {
    body: { orgName: `${prefix} Pvt Ltd`, slug, name: `${prefix} Owner`, email, password: "Password123!" },
  });
  if (res.status !== 201) throw new Error(`signup failed: ${JSON.stringify(res.json)}`);
  const me = await call("GET", "/api/v1/me", { token: res.json.accessToken });
  return {
    slug,
    email,
    token: res.json.accessToken as string,
    orgId: me.json.org.id as string,
    userId: me.json.user.id as string,
  };
}

/** Invites `email` with the given role key and accepts; returns a token for them. */
export async function addMember(ownerToken: string, roleName: string, email: string) {
  const roles = await call("GET", "/api/v1/roles", { token: ownerToken });
  const role = roles.json.find((r: { name: string }) => r.name === roleName);
  const inv = await call("POST", "/api/v1/invitations", { token: ownerToken, body: { email, roleId: role.id } });
  if (inv.status !== 201) throw new Error(`invite failed: ${JSON.stringify(inv.json)}`);
  const acc = await call("POST", "/api/v1/auth/accept-invite", {
    body: { token: inv.json.token, name: roleName, password: "Password123!" },
  });
  if (acc.status !== 200) throw new Error(`accept failed: ${JSON.stringify(acc.json)}`);
  return { token: acc.json.accessToken as string, landingRoute: acc.json.landingRoute as string };
}

/** Resolves to the underlying Postgres error message of a failing query. */
export async function pgError(p: PromiseLike<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as { cause?: { message?: string }; message: string };
    return err.cause?.message ?? err.message;
  }
  throw new Error("expected query to fail");
}
