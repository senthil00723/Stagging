import type { Db, Tx } from "@g3/db";
import { withTenant } from "@g3/db";
import type { Permission } from "@g3/shared";
import type { Context, MiddlewareHandler } from "hono";
import type { Config } from "../env.ts";

export interface TenantAuth {
  userId: string;
  orgId: string;
  roleId: string;
  permissions: Set<string>;
}

export interface TenantEnv {
  Variables: {
    db: Db;
    config: Config;
    auth: TenantAuth;
  };
}

export type TenantContext = Context<TenantEnv>;

export const tx = <T>(c: TenantContext, fn: (tx: Tx) => Promise<T>) => withTenant(c.var.db, c.var.auth.orgId, fn);

export const can = (c: TenantContext, p: Permission) => c.var.auth.permissions.has(p);

/**
 * Server-side permission gate. The React <RequireRole> wrapper is UX only;
 * this is the security boundary and runs on every protected route.
 */
export function requirePermission(...anyOf: Permission[]): MiddlewareHandler<TenantEnv> {
  return async (c, next) => {
    if (!anyOf.some((p) => c.var.auth.permissions.has(p))) {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  };
}
