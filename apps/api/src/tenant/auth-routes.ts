import { randomUUID } from "node:crypto";
import { and, eq, schema, sql, withTenant } from "@g3/db";
import { acceptInviteSchema, DEFAULT_ROLES, loginSchema, signupSchema } from "@g3/shared";
import { createRoute, z } from "@hono/zod-openapi";
import { getCookie } from "hono/cookie";
import { hashPassword, sha256, verifyPassword } from "../lib/crypto.ts";
import { errors, fail, jsonBody, jsonRes, OkSchema, router } from "../lib/http.ts";
import { rateLimit } from "../lib/rate-limit.ts";
import type { TenantEnv } from "./context.ts";
import { clearSessionCookies, REFRESH_COOKIE } from "./cookies.ts";
import { issueSession, parseRefreshCookie, revokeFamily } from "./session.ts";

const SessionResult = z.object({ accessToken: z.string(), landingRoute: z.string() }).openapi("SessionResult");

const tags = ["Tenant auth"];
const limiter = rateLimit({ name: "tenant-auth", windowMs: 60_000, max: 20 });

export const authRoutes = router<TenantEnv>();
authRoutes.use("/signup", limiter);
authRoutes.use("/login", limiter);
authRoutes.use("/accept-invite", limiter);

const landingOf = async (tx: Parameters<Parameters<typeof withTenant>[2]>[0], userId: string) => {
  const [r] = await tx
    .select({ landingRoute: schema.roles.landingRoute })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    .where(eq(schema.users.id, userId));
  return r?.landingRoute ?? "/my-workspace";
};

authRoutes.openapi(
  createRoute({
    method: "post",
    path: "/signup",
    tags,
    summary: "Create an organization and its owner account",
    request: jsonBody(signupSchema),
    responses: { 201: jsonRes(SessionResult), 409: errors[400], 400: errors[400] },
  }),
  async (c) => {
    const input = c.req.valid("json");
    const { db, config } = c.var;
    const [taken] = await db.execute<{ taken: boolean }>(sql`select auth_slug_taken(${input.slug}) as taken`);
    if (taken?.taken) return c.json({ error: "That workspace URL is taken" }, 409);

    const orgId = randomUUID();
    const passwordHash = await hashPassword(input.password);
    const result = await withTenant(db, orgId, async (tx) => {
      await tx.insert(schema.organizations).values({ id: orgId, name: input.orgName, slug: input.slug });
      const roles = await tx
        .insert(schema.roles)
        .values(
          DEFAULT_ROLES.map((r) => ({
            orgId,
            key: r.key,
            name: r.name,
            landingRoute: r.landingRoute,
            permissions: r.permissions,
            isSystem: true,
          })),
        )
        .returning({ id: schema.roles.id, key: schema.roles.key });
      const adminRole = roles.find((r) => r.key === "org_admin")!;
      const [position] = await tx
        .insert(schema.positions)
        .values(
          ["Founder", "Sales Head", "Sales Executive", "Support Agent", "Accountant"].map((name) => ({ orgId, name })),
        )
        .returning({ id: schema.positions.id });
      const [user] = await tx
        .insert(schema.users)
        .values({
          orgId,
          email: input.email,
          name: input.name,
          passwordHash,
          roleId: adminRole.id,
          positionId: position!.id,
        })
        .returning({ id: schema.users.id });
      await tx.insert(schema.auditLog).values({
        orgId,
        actorId: user!.id,
        action: "create",
        entity: "organization",
        entityId: orgId,
        newValue: { name: input.orgName, slug: input.slug },
      });
      const session = await issueSession(c, config, tx, user!.id, orgId);
      return { ...session, landingRoute: "/admin" };
    });
    return c.json(result, 201);
  },
);

authRoutes.openapi(
  createRoute({
    method: "post",
    path: "/login",
    tags,
    summary: "Tenant login (single login page for every role)",
    request: jsonBody(loginSchema),
    responses: { 200: jsonRes(SessionResult), 400: errors[400], 401: errors[401], 403: errors[403], 409: errors[400] },
  }),
  async (c) => {
    const { email, password, orgSlug } = c.req.valid("json");
    const { db, config } = c.var;
    const rows = await db.execute<{
      user_id: string;
      org_id: string;
      org_status: string;
      password_hash: string;
      user_status: string;
    }>(sql`select * from auth_find_login(${email}, ${orgSlug ?? null})`);

    if (rows.length > 1) {
      await verifyPassword(undefined, password);
      return c.json({ error: "This email belongs to several workspaces; choose one" }, 409);
    }
    const row = rows[0];
    const ok = await verifyPassword(row?.password_hash, password);
    if (!row || !ok || row.user_status !== "active") return c.json({ error: "Invalid email or password" }, 401);
    if (row.org_status !== "active") return c.json({ error: "Organization suspended" }, 403);

    const result = await withTenant(db, row.org_id, async (tx) => ({
      ...(await issueSession(c, config, tx, row.user_id, row.org_id)),
      landingRoute: await landingOf(tx, row.user_id),
    }));
    return c.json(result, 200);
  },
);

authRoutes.openapi(
  createRoute({
    method: "post",
    path: "/refresh",
    tags,
    summary: "Rotate the refresh token (reuse revokes the whole token family)",
    responses: { 200: jsonRes(SessionResult), 401: errors[401] },
  }),
  async (c) => {
    const parsed = parseRefreshCookie(getCookie(c, REFRESH_COOKIE));
    if (!parsed) return c.json({ error: "Not authenticated" }, 401);
    const { db, config } = c.var;
    const [status] = await db.execute<{ s: string | null }>(sql`select auth_org_status(${parsed.orgId}) as s`);
    if (status?.s !== "active") return c.json({ error: "Not authenticated" }, 401);

    const result = await withTenant(db, parsed.orgId, async (tx) => {
      const [tok] = await tx
        .select()
        .from(schema.refreshTokens)
        .where(eq(schema.refreshTokens.tokenHash, sha256(parsed.secret)))
        .for("update");
      if (!tok) return null;
      if (tok.revokedAt) {
        // Reuse of a rotated token: assume theft, kill the family.
        await revokeFamily(tx, tok.familyId);
        return null;
      }
      if (tok.expiresAt < new Date()) return null;
      const [user] = await tx
        .select({ status: schema.users.status })
        .from(schema.users)
        .where(eq(schema.users.id, tok.userId));
      if (user?.status !== "active") return null;
      await tx.update(schema.refreshTokens).set({ revokedAt: new Date() }).where(eq(schema.refreshTokens.id, tok.id));
      return {
        ...(await issueSession(c, config, tx, tok.userId, tok.orgId, tok.familyId)),
        landingRoute: await landingOf(tx, tok.userId),
      };
    });
    if (!result) {
      clearSessionCookies(c);
      return c.json({ error: "Not authenticated" }, 401);
    }
    return c.json(result, 200);
  },
);

authRoutes.openapi(
  createRoute({
    method: "post",
    path: "/logout",
    tags,
    summary: "Revoke the current refresh token family and clear cookies",
    responses: { 200: jsonRes(OkSchema) },
  }),
  async (c) => {
    const parsed = parseRefreshCookie(getCookie(c, REFRESH_COOKIE));
    if (parsed) {
      await withTenant(c.var.db, parsed.orgId, async (tx) => {
        const [tok] = await tx
          .select({ familyId: schema.refreshTokens.familyId })
          .from(schema.refreshTokens)
          .where(eq(schema.refreshTokens.tokenHash, sha256(parsed.secret)));
        if (tok) await revokeFamily(tx, tok.familyId);
      });
    }
    clearSessionCookies(c);
    return c.json({ ok: true as const }, 200);
  },
);

authRoutes.openapi(
  createRoute({
    method: "post",
    path: "/accept-invite",
    tags,
    summary: "Accept an invitation and create the user account",
    request: jsonBody(acceptInviteSchema),
    responses: { 200: jsonRes(SessionResult), 400: errors[400] },
  }),
  async (c) => {
    const input = c.req.valid("json");
    const { db, config } = c.var;
    const tokenHash = sha256(input.token);
    const [found] = await db.execute<{ invitation_id: string; org_id: string }>(
      sql`select * from auth_find_invitation(${tokenHash})`,
    );
    if (!found) return c.json({ error: "Invitation is invalid or expired" }, 400);
    const passwordHash = await hashPassword(input.password);

    const result = await withTenant(db, found.org_id, async (tx) => {
      const [inv] = await tx
        .update(schema.invitations)
        .set({ acceptedAt: new Date() })
        .where(and(eq(schema.invitations.id, found.invitation_id), sql`accepted_at is null`))
        .returning();
      if (!inv) return null;
      const [existing] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, inv.email));
      if (existing) return null;
      const [user] = await tx
        .insert(schema.users)
        .values({
          orgId: inv.orgId,
          email: inv.email,
          name: input.name,
          passwordHash,
          roleId: inv.roleId,
          positionId: inv.positionId,
        })
        .returning({ id: schema.users.id });
      await tx.insert(schema.auditLog).values({
        orgId: inv.orgId,
        actorId: user!.id,
        action: "accept_invite",
        entity: "user",
        entityId: user!.id,
        newValue: { email: inv.email, roleId: inv.roleId },
      });
      return {
        ...(await issueSession(c, config, tx, user!.id, inv.orgId)),
        landingRoute: await landingOf(tx, user!.id),
      };
    });
    if (!result) return fail(400, "Invitation is invalid or already used");
    return c.json(result!, 200);
  },
);
