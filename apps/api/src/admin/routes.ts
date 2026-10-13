import { type Db, desc, eq, schema, sql } from "@g3/db";
import { adminLoginSchema, totpSchema } from "@g3/shared";
import { createRoute, z } from "@hono/zod-openapi";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { generateSecret, generateURI, verify as verifyTotp } from "otplib";
import QRCode from "qrcode";
import type { Config } from "../env.ts";
import { verifyPassword } from "../lib/crypto.ts";
import { errors, jsonBody, jsonRes, OkSchema, router } from "../lib/http.ts";
import { clientIp } from "../lib/ip.ts";
import { AUDIENCE, signJwt, verifyJwt } from "../lib/jwt.ts";
import { rateLimit } from "../lib/rate-limit.ts";

/**
 * Super-admin API. Fully separate from tenant auth: PlatformAdmin table, its
 * own JWT secret + audience, its own cookie, its own DB role (g3_platform),
 * mandatory TOTP, optional IP allowlist. Nothing here imports tenant auth.
 */
export interface AdminEnv {
  Variables: {
    platformDb: Db;
    config: Config;
    admin: { id: string; email: string };
  };
}

const ADMIN_COOKIE = "g3_admin_at";
const tags = ["Platform admin"];

export const adminRoutes = router<AdminEnv>();

const ipAllowlist: MiddlewareHandler<AdminEnv> = async (c, next) => {
  const list = c.var.config.adminIpAllowlist;
  if (list.length > 0 && !list.includes(clientIp(c))) return c.json({ error: "Forbidden" }, 403);
  await next();
};

const adminAuth: MiddlewareHandler<AdminEnv> = async (c, next) => {
  const header = c.req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : getCookie(c, ADMIN_COOKIE);
  if (!token) return c.json({ error: "Not authenticated" }, 401);
  try {
    const claims = await verifyJwt<{ sub: string; email: string; mfa: boolean }>(
      c.var.config.adminJwtSecret,
      AUDIENCE.admin,
      token,
    );
    if (claims.mfa !== true) throw new Error("mfa required");
    c.set("admin", { id: claims.sub, email: claims.email });
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
  await next();
};

// biome-ignore lint/suspicious/noExplicitAny: route-specific context generics
const audit = (c: Context<AdminEnv, any, any>, action: string, target?: string, meta: Record<string, unknown> = {}) =>
  c.var.platformDb.insert(schema.platformAuditLog).values({
    adminId: c.var.admin?.id ?? null,
    action,
    target,
    meta,
    ip: clientIp(c),
  });

adminRoutes.use("*", ipAllowlist);
adminRoutes.use("/auth/*", rateLimit({ name: "admin-auth", windowMs: 60_000, max: 10 }));
for (const p of ["/me", "/tenants", "/tenants/*", "/metrics", "/audit-log"]) adminRoutes.use(p, adminAuth);

// ── Login: password → TOTP (enroll on first login) ─────────────────────────
const LoginResult = z
  .discriminatedUnion("status", [
    z.object({ status: z.literal("totp"), challenge: z.string() }),
    z.object({ status: z.literal("enroll"), challenge: z.string(), otpauthUrl: z.string(), qrDataUrl: z.string() }),
  ])
  .openapi("AdminLoginResult");

adminRoutes.openapi(
  createRoute({
    method: "post",
    path: "/auth/login",
    tags,
    summary: "Step 1: password. Always followed by a TOTP step; 2FA is mandatory.",
    request: jsonBody(adminLoginSchema),
    responses: { 200: jsonRes(LoginResult), 401: errors[401] },
  }),
  async (c) => {
    const { email, password } = c.req.valid("json");
    const { platformDb: db, config } = c.var;
    const [admin] = await db.select().from(schema.platformAdmins).where(eq(schema.platformAdmins.email, email));
    if (!(await verifyPassword(admin?.passwordHash, password)) || !admin) {
      return c.json({ error: "Invalid email or password" }, 401);
    }
    const challenge = await signJwt(config.adminJwtSecret, AUDIENCE.adminMfa, { sub: admin.id }, "5m");
    if (admin.totpSecret) return c.json({ status: "totp" as const, challenge }, 200);

    const secret = generateSecret();
    await db.update(schema.platformAdmins).set({ totpPending: secret }).where(eq(schema.platformAdmins.id, admin.id));
    const otpauthUrl = generateURI({ issuer: "G3Leads Admin", label: admin.email, secret });
    return c.json(
      { status: "enroll" as const, challenge, otpauthUrl, qrDataUrl: await QRCode.toDataURL(otpauthUrl) },
      200,
    );
  },
);

adminRoutes.openapi(
  createRoute({
    method: "post",
    path: "/auth/totp",
    tags,
    summary: "Step 2: verify TOTP code (confirms enrollment on first use) and start the admin session",
    request: jsonBody(totpSchema),
    responses: { 200: jsonRes(z.object({ accessToken: z.string() })), 401: errors[401] },
  }),
  async (c) => {
    const { challenge, code } = c.req.valid("json");
    const { platformDb: db, config } = c.var;
    let adminId: string;
    try {
      adminId = (await verifyJwt(config.adminJwtSecret, AUDIENCE.adminMfa, challenge)).sub!;
    } catch {
      return c.json({ error: "Login expired, start again" }, 401);
    }
    const [admin] = await db.select().from(schema.platformAdmins).where(eq(schema.platformAdmins.id, adminId));
    const secret = admin?.totpSecret ?? admin?.totpPending;
    if (!admin || !secret) return c.json({ error: "Invalid code" }, 401);
    const { valid } = await verifyTotp({ secret, token: code, epochTolerance: 30 });
    if (!valid) return c.json({ error: "Invalid code" }, 401);

    await db
      .update(schema.platformAdmins)
      .set({ totpSecret: secret, totpPending: null, lastLoginAt: new Date() })
      .where(eq(schema.platformAdmins.id, admin.id));
    const accessToken = await signJwt(
      config.adminJwtSecret,
      AUDIENCE.admin,
      { sub: admin.id, email: admin.email, mfa: true },
      "30m",
    );
    setCookie(c, ADMIN_COOKIE, accessToken, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: "Strict",
      path: "/admin-api",
      maxAge: 30 * 60,
    });
    c.set("admin", { id: admin.id, email: admin.email });
    await audit(c, admin.totpSecret ? "login" : "login_enrolled_2fa");
    return c.json({ accessToken }, 200);
  },
);

adminRoutes.openapi(
  createRoute({ method: "post", path: "/auth/logout", tags, responses: { 200: jsonRes(OkSchema) } }),
  async (c) => {
    deleteCookie(c, ADMIN_COOKIE, { path: "/admin-api" });
    return c.json({ ok: true as const }, 200);
  },
);

adminRoutes.openapi(
  createRoute({
    method: "get",
    path: "/me",
    tags,
    responses: { 200: jsonRes(z.object({ id: z.string(), email: z.string() })), 401: errors[401] },
  }),
  (c) => c.json(c.var.admin, 200),
);

// ── Tenants ────────────────────────────────────────────────────────────────
const TenantOut = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    status: z.string(),
    users: z.number(),
    createdAt: z.string(),
  })
  .openapi("Tenant");

adminRoutes.openapi(
  createRoute({
    method: "get",
    path: "/tenants",
    tags,
    responses: { 200: jsonRes(z.array(TenantOut)), 401: errors[401] },
  }),
  async (c) => {
    const rows = await c.var.platformDb
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        slug: schema.organizations.slug,
        status: schema.organizations.status,
        createdAt: schema.organizations.createdAt,
        users: sql<number>`(select count(*)::int from users u where u.org_id = ${schema.organizations.id})`,
      })
      .from(schema.organizations)
      .orderBy(desc(schema.organizations.createdAt));
    return c.json(
      rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      200,
    );
  },
);

const setStatus = (status: "active" | "suspended") =>
  createRoute({
    method: "post",
    path: `/tenants/{id}/${status === "active" ? "reactivate" : "suspend"}`,
    tags,
    request: { params: z.object({ id: z.uuid() }) },
    responses: { 200: jsonRes(OkSchema), 401: errors[401], 404: errors[400] },
  });

for (const status of ["active", "suspended"] as const) {
  adminRoutes.openapi(setStatus(status), async (c) => {
    const { id } = c.req.valid("param");
    const [row] = await c.var.platformDb
      .update(schema.organizations)
      .set({ status })
      .where(eq(schema.organizations.id, id))
      .returning({ id: schema.organizations.id });
    if (!row) return c.json({ error: "Not found" }, 404);
    await audit(c, status === "active" ? "tenant.reactivate" : "tenant.suspend", id);
    return c.json({ ok: true as const }, 200);
  });
}

adminRoutes.openapi(
  createRoute({
    method: "get",
    path: "/metrics",
    tags,
    responses: { 200: jsonRes(z.record(z.string(), z.number())), 401: errors[401] },
  }),
  async (c) => {
    const [m] = await c.var.platformDb.execute<{
      tenants: number;
      active: number;
      suspended: number;
      users: number;
    }>(sql`
      select count(*)::int as tenants,
             count(*) filter (where status = 'active')::int as active,
             count(*) filter (where status = 'suspended')::int as suspended,
             (select count(*)::int from users) as users
      from organizations`);
    return c.json(m ?? {}, 200);
  },
);

adminRoutes.openapi(
  createRoute({
    method: "get",
    path: "/audit-log",
    tags,
    responses: { 200: jsonRes(z.array(z.record(z.string(), z.unknown()))), 401: errors[401] },
  }),
  async (c) =>
    c.json(
      await c.var.platformDb
        .select()
        .from(schema.platformAuditLog)
        .orderBy(desc(schema.platformAuditLog.id))
        .limit(100),
      200,
    ),
);
