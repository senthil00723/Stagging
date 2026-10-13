import { asc, desc, eq, isNull, schema, sql } from "@g3/db";
import {
  contactSchema,
  inviteSchema,
  LANDING_ROUTES,
  type LandingRoute,
  positionSchema,
  ROUTE_PERMISSION,
  roleSchema,
} from "@g3/shared";
import { createRoute, z } from "@hono/zod-openapi";
import { randomToken, sha256 } from "../lib/crypto.ts";
import { errors, jsonBody, jsonRes, router } from "../lib/http.ts";
import { can, requirePermission, type TenantEnv, tx } from "./context.ts";
import { tenantAuth } from "./middleware.ts";

export const tenantRoutes = router<TenantEnv>();
tenantRoutes.use("*", tenantAuth);
tenantRoutes.openAPIRegistry.registerComponent("securitySchemes", "tenantCookie", {
  type: "apiKey",
  in: "cookie",
  name: "g3_at",
});
const security = [{ tenantCookie: [] }];

const Id = z.object({ id: z.uuid() });
const AnyObj = z.record(z.string(), z.unknown());

// ── Session ────────────────────────────────────────────────────────────────
const SessionSchema = z
  .object({
    user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
    org: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
    role: z.object({ id: z.string(), name: z.string(), landingRoute: z.string() }),
    position: z.object({ id: z.string(), name: z.string() }).nullable(),
    permissions: z.array(z.string()),
  })
  .openapi("Session");

tenantRoutes.openapi(
  createRoute({
    method: "get",
    path: "/me",
    tags: ["Session"],
    security,
    summary: "Current user, organization, role and effective permissions",
    responses: { 200: jsonRes(SessionSchema), 401: errors[401] },
  }),
  async (c) => {
    const me = await tx(c, async (t) => {
      const [r] = await t
        .select({
          user: { id: schema.users.id, name: schema.users.name, email: schema.users.email },
          org: { id: schema.organizations.id, name: schema.organizations.name, slug: schema.organizations.slug },
          role: { id: schema.roles.id, name: schema.roles.name, landingRoute: schema.roles.landingRoute },
          positionId: schema.positions.id,
          positionName: schema.positions.name,
          permissions: schema.roles.permissions,
        })
        .from(schema.users)
        .innerJoin(schema.organizations, eq(schema.organizations.id, schema.users.orgId))
        .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
        .leftJoin(schema.positions, eq(schema.positions.id, schema.users.positionId))
        .where(eq(schema.users.id, c.var.auth.userId));
      return r!;
    });
    const { positionId, positionName, ...rest } = me;
    return c.json(
      { ...rest, position: positionId && positionName ? { id: positionId, name: positionName } : null },
      200,
    );
  },
);

// ── Roles & positions (data-driven RBAC) ───────────────────────────────────
const RoleOut = z
  .object({
    id: z.string(),
    name: z.string(),
    landingRoute: z.string(),
    permissions: z.array(z.string()),
    isSystem: z.boolean(),
  })
  .openapi("Role");

tenantRoutes.get("/roles", requirePermission("users.manage", "roles.manage"));
tenantRoutes.openapi(
  createRoute({
    method: "get",
    path: "/roles",
    tags: ["RBAC"],
    security,
    responses: { 200: jsonRes(z.array(RoleOut)), 403: errors[403] },
  }),
  async (c) =>
    c.json(
      await tx(c, (t) =>
        t
          .select({
            id: schema.roles.id,
            name: schema.roles.name,
            landingRoute: schema.roles.landingRoute,
            permissions: schema.roles.permissions,
            isSystem: schema.roles.isSystem,
          })
          .from(schema.roles)
          .orderBy(asc(schema.roles.createdAt), asc(schema.roles.name)),
      ),
      200,
    ),
);

tenantRoutes.post("/roles", requirePermission("roles.manage"));
tenantRoutes.openapi(
  createRoute({
    method: "post",
    path: "/roles",
    tags: ["RBAC"],
    security,
    summary: "Create a custom role, e.g. 'Regional Sales Head'",
    request: jsonBody(roleSchema),
    responses: { 201: jsonRes(Id), 403: errors[403], 409: errors[400] },
  }),
  async (c) => {
    const input = c.req.valid("json");
    const { orgId, userId } = c.var.auth;
    const created = await tx(c, async (t) => {
      const [dupe] = await t
        .select({ id: schema.roles.id })
        .from(schema.roles)
        .where(eq(schema.roles.name, input.name));
      if (dupe) return null;
      const [role] = await t
        .insert(schema.roles)
        .values({ orgId, name: input.name, landingRoute: input.landingRoute, permissions: input.permissions })
        .returning({ id: schema.roles.id });
      await t.insert(schema.auditLog).values({
        orgId,
        actorId: userId,
        action: "create",
        entity: "role",
        entityId: role!.id,
        newValue: input,
      });
      return role!;
    });
    if (!created) return c.json({ error: "A role with that name exists" }, 409);
    return c.json(created, 201);
  },
);

const PositionOut = z.object({ id: z.string(), name: z.string() }).openapi("Position");
tenantRoutes.openapi(
  createRoute({
    method: "get",
    path: "/positions",
    tags: ["RBAC"],
    security,
    responses: { 200: jsonRes(z.array(PositionOut)) },
  }),
  async (c) =>
    c.json(
      await tx(c, (t) =>
        t
          .select({ id: schema.positions.id, name: schema.positions.name })
          .from(schema.positions)
          .orderBy(asc(schema.positions.name)),
      ),
      200,
    ),
);

tenantRoutes.post("/positions", requirePermission("roles.manage"));
tenantRoutes.openapi(
  createRoute({
    method: "post",
    path: "/positions",
    tags: ["RBAC"],
    security,
    request: jsonBody(positionSchema),
    responses: { 201: jsonRes(Id), 403: errors[403] },
  }),
  async (c) => {
    const { name } = c.req.valid("json");
    const [p] = await tx(c, (t) =>
      t
        .insert(schema.positions)
        .values({ orgId: c.var.auth.orgId, name })
        .onConflictDoNothing()
        .returning({ id: schema.positions.id }),
    );
    if (!p) return c.json({ error: "Position exists" }, 403);
    return c.json(p, 201);
  },
);

// ── Users & invitations ────────────────────────────────────────────────────
const UserOut = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    status: z.string(),
    roleId: z.string(),
    roleName: z.string(),
    positionName: z.string().nullable(),
  })
  .openapi("User");

tenantRoutes.get("/users", requirePermission("users.manage", "team.view"));
tenantRoutes.openapi(
  createRoute({
    method: "get",
    path: "/users",
    tags: ["Users"],
    security,
    responses: { 200: jsonRes(z.array(UserOut)), 403: errors[403] },
  }),
  async (c) =>
    c.json(
      await tx(c, (t) =>
        t
          .select({
            id: schema.users.id,
            name: schema.users.name,
            email: schema.users.email,
            status: schema.users.status,
            roleId: schema.roles.id,
            roleName: schema.roles.name,
            positionName: schema.positions.name,
          })
          .from(schema.users)
          .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
          .leftJoin(schema.positions, eq(schema.positions.id, schema.users.positionId))
          .orderBy(asc(schema.users.createdAt)),
      ),
      200,
    ),
);

tenantRoutes.patch("/users/:id", requirePermission("users.manage"));
tenantRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/users/{id}",
    tags: ["Users"],
    security,
    summary: "Change a user's role or position",
    request: {
      params: Id,
      ...jsonBody(z.object({ roleId: z.uuid().optional(), positionId: z.uuid().nullable().optional() })),
    },
    responses: { 200: jsonRes(Id), 403: errors[403], 404: errors[400] },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const { orgId, userId } = c.var.auth;
    const updated = await tx(c, async (t) => {
      const [before] = await t.select().from(schema.users).where(eq(schema.users.id, id));
      if (!before) return null;
      const [u] = await t
        .update(schema.users)
        .set(body)
        .where(eq(schema.users.id, id))
        .returning({ id: schema.users.id });
      await t.insert(schema.auditLog).values({
        orgId,
        actorId: userId,
        action: "update",
        entity: "user",
        entityId: id,
        oldValue: { roleId: before.roleId, positionId: before.positionId },
        newValue: body,
      });
      return u;
    });
    if (!updated) return c.json({ error: "Not found" }, 404);
    return c.json(updated, 200);
  },
);

const InvitationOut = z
  .object({ id: z.string(), email: z.string(), roleName: z.string(), expiresAt: z.string(), accepted: z.boolean() })
  .openapi("Invitation");

tenantRoutes.get("/invitations", requirePermission("users.manage"));
tenantRoutes.openapi(
  createRoute({
    method: "get",
    path: "/invitations",
    tags: ["Users"],
    security,
    responses: { 200: jsonRes(z.array(InvitationOut)), 403: errors[403] },
  }),
  async (c) => {
    const rows = await tx(c, (t) =>
      t
        .select({
          id: schema.invitations.id,
          email: schema.invitations.email,
          roleName: schema.roles.name,
          expiresAt: schema.invitations.expiresAt,
          acceptedAt: schema.invitations.acceptedAt,
        })
        .from(schema.invitations)
        .innerJoin(schema.roles, eq(schema.roles.id, schema.invitations.roleId))
        .orderBy(desc(schema.invitations.createdAt)),
    );
    return c.json(
      rows.map(({ acceptedAt, expiresAt, ...r }) => ({
        ...r,
        expiresAt: expiresAt.toISOString(),
        accepted: acceptedAt !== null,
      })),
      200,
    );
  },
);

tenantRoutes.post("/invitations", requirePermission("users.manage"));
tenantRoutes.openapi(
  createRoute({
    method: "post",
    path: "/invitations",
    tags: ["Users"],
    security,
    summary: "Invite a teammate. Phase 0 returns the link; email delivery arrives with the worker in Phase 3.",
    request: jsonBody(inviteSchema),
    responses: {
      201: jsonRes(z.object({ id: z.string(), token: z.string(), invitePath: z.string() })),
      400: errors[400],
      403: errors[403],
    },
  }),
  async (c) => {
    const input = c.req.valid("json");
    const { orgId, userId } = c.var.auth;
    const token = randomToken();
    const inv = await tx(c, async (t) => {
      const [role] = await t
        .select({ id: schema.roles.id })
        .from(schema.roles)
        .where(eq(schema.roles.id, input.roleId));
      if (!role) return null; // RLS: a role id from another tenant is simply invisible
      const [member] = await t
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, input.email));
      if (member) return null;
      const [row] = await t
        .insert(schema.invitations)
        .values({
          orgId,
          email: input.email,
          roleId: input.roleId,
          positionId: input.positionId,
          tokenHash: sha256(token),
          invitedBy: userId,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        })
        .returning({ id: schema.invitations.id });
      await t.insert(schema.auditLog).values({
        orgId,
        actorId: userId,
        action: "invite",
        entity: "user",
        newValue: { email: input.email, roleId: input.roleId },
      });
      return row!;
    });
    if (!inv) return c.json({ error: "Unknown role, or user already a member" }, 400);
    return c.json({ id: inv.id, token, invitePath: `/accept-invite?token=${token}` }, 201);
  },
);

// ── Contacts (sample tenant data; record-level scoping by permission) ──────
const ContactOut = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    ownerId: z.string().nullable(),
  })
  .openapi("Contact");

tenantRoutes.get("/contacts", requirePermission("contacts.read.all", "contacts.read.own"));
tenantRoutes.openapi(
  createRoute({
    method: "get",
    path: "/contacts",
    tags: ["Contacts"],
    security,
    summary: "List contacts: all of them with contacts.read.all, else only the caller's own",
    responses: { 200: jsonRes(z.array(ContactOut)), 403: errors[403] },
  }),
  async (c) => {
    const all = can(c, "contacts.read.all");
    const rows = await tx(c, (t) =>
      t
        .select({
          id: schema.contacts.id,
          name: schema.contacts.name,
          email: schema.contacts.email,
          phone: schema.contacts.phone,
          ownerId: schema.contacts.ownerId,
        })
        .from(schema.contacts)
        .where(all ? undefined : eq(schema.contacts.ownerId, c.var.auth.userId))
        .orderBy(desc(schema.contacts.createdAt)),
    );
    return c.json(rows, 200);
  },
);

tenantRoutes.post("/contacts", requirePermission("contacts.write"));
tenantRoutes.openapi(
  createRoute({
    method: "post",
    path: "/contacts",
    tags: ["Contacts"],
    security,
    request: jsonBody(contactSchema),
    responses: { 201: jsonRes(Id), 403: errors[403] },
  }),
  async (c) => {
    const input = c.req.valid("json");
    const { orgId, userId } = c.var.auth;
    // Only users who can see everyone's contacts may assign them to someone else.
    const ownerId = input.ownerId && can(c, "contacts.read.all") ? input.ownerId : userId;
    const row = await tx(c, async (t) => {
      const [r] = await t
        .insert(schema.contacts)
        .values({ orgId, ownerId, name: input.name, email: input.email, phone: input.phone })
        .returning({ id: schema.contacts.id });
      await t.insert(schema.auditLog).values({
        orgId,
        actorId: userId,
        action: "create",
        entity: "contact",
        entityId: r!.id,
        newValue: { ...input, ownerId },
      });
      return r!;
    });
    return c.json(row, 201);
  },
);

// ── Role dashboards ────────────────────────────────────────────────────────
const area = z.enum(LANDING_ROUTES.map((r) => r.slice(1)) as [string, ...string[]]);

tenantRoutes.openapi(
  createRoute({
    method: "get",
    path: "/dashboards/{area}",
    tags: ["Dashboards"],
    security,
    summary: "Summary data for a landing dashboard; each requires its own permission",
    request: { params: z.object({ area }) },
    responses: { 200: jsonRes(AnyObj), 403: errors[403] },
  }),
  async (c) => {
    const key = c.req.valid("param").area;
    const route = `/${key}` as LandingRoute;
    if (!can(c, ROUTE_PERMISSION[route])) return c.json({ error: "Forbidden" }, 403);
    const { userId } = c.var.auth;

    const data = await tx(c, async (t) => {
      const count = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
      const n = sql<number>`count(*)::int`;
      switch (route) {
        case "/admin":
          return {
            users: await count(t.select({ n }).from(schema.users)),
            roles: await count(t.select({ n }).from(schema.roles)),
            pendingInvites: await count(
              t.select({ n }).from(schema.invitations).where(isNull(schema.invitations.acceptedAt)),
            ),
            recentAudit: await t
              .select({
                action: schema.auditLog.action,
                entity: schema.auditLog.entity,
                createdAt: schema.auditLog.createdAt,
              })
              .from(schema.auditLog)
              .orderBy(desc(schema.auditLog.createdAt))
              .limit(8),
          };
        case "/team":
          return {
            contacts: await count(t.select({ n }).from(schema.contacts)),
            byOwner: await t
              .select({ owner: schema.users.name, contacts: n })
              .from(schema.contacts)
              .leftJoin(schema.users, eq(schema.users.id, schema.contacts.ownerId))
              .groupBy(schema.users.name)
              .orderBy(desc(n)),
          };
        case "/my-workspace":
          return {
            myContacts: await count(t.select({ n }).from(schema.contacts).where(eq(schema.contacts.ownerId, userId))),
          };
        case "/inbox":
          return { openConversations: 0, note: "Unified inbox ships in Phase 3" };
        case "/invoicing":
          return { outstandingInr: 0, note: "GST invoicing ships in Phase 3" };
      }
    });
    return c.json({ area: route, ...data }, 200);
  },
);

// ── Audit log ──────────────────────────────────────────────────────────────
tenantRoutes.get("/audit-log", requirePermission("org.admin"));
tenantRoutes.openapi(
  createRoute({
    method: "get",
    path: "/audit-log",
    tags: ["Audit"],
    security,
    responses: { 200: jsonRes(z.array(AnyObj)), 403: errors[403] },
  }),
  async (c) =>
    c.json(
      await tx(c, (t) => t.select().from(schema.auditLog).orderBy(desc(schema.auditLog.createdAt)).limit(200)),
      200,
    ),
);
