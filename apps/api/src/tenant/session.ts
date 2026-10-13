import { randomUUID } from "node:crypto";
import { and, eq, isNull, schema, type Tx } from "@g3/db";
import type { Context } from "hono";
import type { Config } from "../env.ts";
import { randomToken, sha256 } from "../lib/crypto.ts";
import { AUDIENCE, signJwt } from "../lib/jwt.ts";
import { REFRESH_TTL_SEC, setSessionCookies } from "./cookies.ts";

/**
 * Issues an access JWT + a rotating refresh token. The refresh cookie value is
 * `<orgId>.<secret>`: the org id lets us set the RLS context before looking up
 * the (hashed) secret, without any cross-tenant query.
 */
export async function issueSession(
  c: Context,
  config: Config,
  tx: Tx,
  userId: string,
  orgId: string,
  familyId: string = randomUUID(),
) {
  const [u] = await tx
    .select({ roleId: schema.users.roleId, position: schema.positions.name })
    .from(schema.users)
    .leftJoin(schema.positions, eq(schema.positions.id, schema.users.positionId))
    .where(eq(schema.users.id, userId));
  if (!u) throw new Error("user vanished while issuing session");

  const access = await signJwt(
    config.tenantJwtSecret,
    AUDIENCE.tenant,
    { sub: userId, org: orgId, role: u.roleId, pos: u.position ?? null },
    "15m",
  );
  const secret = randomToken();
  await tx.insert(schema.refreshTokens).values({
    orgId,
    userId,
    familyId,
    tokenHash: sha256(secret),
    expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
  });
  const refresh = `${orgId}.${secret}`;
  setSessionCookies(c, config, access, refresh);
  return { accessToken: access };
}

export function parseRefreshCookie(value: string | undefined) {
  if (!value) return null;
  const dot = value.indexOf(".");
  const orgId = value.slice(0, dot);
  const secret = value.slice(dot + 1);
  if (dot < 0 || !/^[0-9a-f-]{36}$/.test(orgId) || secret.length < 20) return null;
  return { orgId, secret };
}

export async function revokeFamily(tx: Tx, familyId: string) {
  await tx
    .update(schema.refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.refreshTokens.familyId, familyId), isNull(schema.refreshTokens.revokedAt)));
}
