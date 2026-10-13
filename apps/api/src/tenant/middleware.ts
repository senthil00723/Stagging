import { eq, schema, withTenant } from "@g3/db";
import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { AUDIENCE, type TenantClaims, verifyJwt } from "../lib/jwt.ts";
import type { TenantEnv } from "./context.ts";
import { ACCESS_COOKIE } from "./cookies.ts";

export function bearerOrCookie(header: string | undefined, cookie: string | undefined) {
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return cookie;
}

/**
 * Authenticates a tenant request: verifies the JWT against the TENANT secret
 * and audience, then re-loads user + role from the DB under RLS so permission
 * changes and suspensions take effect immediately (claims are not trusted for
 * authorization).
 */
export const tenantAuth: MiddlewareHandler<TenantEnv> = async (c, next) => {
  const token = bearerOrCookie(c.req.header("authorization"), getCookie(c, ACCESS_COOKIE));
  if (!token) return c.json({ error: "Not authenticated" }, 401);

  let claims: TenantClaims;
  try {
    claims = await verifyJwt<TenantClaims>(c.var.config.tenantJwtSecret, AUDIENCE.tenant, token);
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  const row = await withTenant(c.var.db, claims.org, async (tx) => {
    const [r] = await tx
      .select({
        userId: schema.users.id,
        userStatus: schema.users.status,
        roleId: schema.roles.id,
        permissions: schema.roles.permissions,
        orgStatus: schema.organizations.status,
      })
      .from(schema.users)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
      .innerJoin(schema.organizations, eq(schema.organizations.id, schema.users.orgId))
      .where(eq(schema.users.id, claims.sub));
    return r;
  });

  if (row?.userStatus !== "active") return c.json({ error: "Not authenticated" }, 401);
  if (row.orgStatus !== "active") return c.json({ error: "Organization suspended" }, 403);

  c.set("auth", {
    userId: row.userId,
    orgId: claims.org,
    roleId: row.roleId,
    permissions: new Set(row.permissions),
  });
  await next();
};
