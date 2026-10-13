/**
 * Demo mode only (VITE_DEMO=1): an in-browser stand-in for apps/api so the
 * SPA can be hosted as a static page. It mirrors the real API's contract and
 * its permission checks (403s), and scopes every read to the signed-in user's
 * org the way RLS does. Data lives in this browser's localStorage.
 */
import { DEFAULT_ROLES, LANDING_ROUTES, type LandingRoute, ROUTE_PERMISSION } from "@g3/shared";
import { storage } from "../lib/storage.ts";

interface Org {
  id: string;
  name: string;
  slug: string;
}
interface Role {
  id: string;
  orgId: string;
  name: string;
  landingRoute: string;
  permissions: string[];
  isSystem: boolean;
}
interface Position {
  id: string;
  orgId: string;
  name: string;
}
interface User {
  id: string;
  orgId: string;
  email: string;
  name: string;
  password: string;
  roleId: string;
  positionId: string | null;
}
interface Invitation {
  id: string;
  orgId: string;
  email: string;
  roleId: string;
  token: string;
  expiresAt: string;
  acceptedAt: string | null;
}
interface Contact {
  id: string;
  orgId: string;
  ownerId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
}
interface Audit {
  orgId: string;
  action: string;
  entity: string;
  createdAt: string;
}
interface Db {
  orgs: Org[];
  roles: Role[];
  positions: Position[];
  users: User[];
  invitations: Invitation[];
  contacts: Contact[];
  audit: Audit[];
  sessionUserId: string | null;
}

const KEY = "g3.demo.db.v1";
export const DEMO_PASSWORD = "Password123!";
export const DEMO_ACCOUNTS = [
  { email: "admin@acme.test", label: "Org Admin" },
  { email: "manager@acme.test", label: "Sales Manager" },
  { email: "rep@acme.test", label: "Sales Executive" },
  { email: "support@acme.test", label: "Support Agent" },
  { email: "finance@acme.test", label: "Finance / Billing" },
];

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function seed(): Db {
  const orgId = uid();
  const db: Db = {
    orgs: [{ id: orgId, name: "Acme Traders Pvt Ltd", slug: "acme" }],
    roles: [],
    positions: [],
    users: [],
    invitations: [],
    contacts: [],
    audit: [],
    sessionUserId: null,
  };
  const roleIds: Record<string, string> = {};
  for (const r of DEFAULT_ROLES) {
    const id = uid();
    roleIds[r.key] = id;
    db.roles.push({
      id,
      orgId,
      name: r.name,
      landingRoute: r.landingRoute,
      permissions: [...r.permissions],
      isSystem: true,
    });
  }
  const people = [
    ["org_admin", "Asha Iyer", "admin@acme.test", "Founder"],
    ["sales_manager", "Manoj Kulkarni", "manager@acme.test", "Sales Head"],
    ["sales_executive", "Riya Desai", "rep@acme.test", "Sales Executive"],
    ["sales_executive", "Arjun Nair", "arjun@acme.test", "Sales Executive"],
    ["support_agent", "Sanjay Reddy", "support@acme.test", "Support Agent"],
    ["finance", "Farah Khan", "finance@acme.test", "Accountant"],
  ] as const;
  const ids: Record<string, string> = {};
  for (const [key, name, email, position] of people) {
    let pos = db.positions.find((p) => p.name === position);
    if (!pos) {
      pos = { id: uid(), orgId, name: position };
      db.positions.push(pos);
    }
    const id = uid();
    ids[email] = id;
    db.users.push({ id, orgId, email, name, password: DEMO_PASSWORD, roleId: roleIds[key]!, positionId: pos.id });
  }
  const contacts: [string, string, string, string][] = [
    ["rep@acme.test", "Priya Sharma", "priya@kiranastores.in", "+91 98765 43210"],
    ["rep@acme.test", "Rahul Verma", "rahul@vermatextiles.in", "+91 98123 45678"],
    ["rep@acme.test", "Meera Joshi", "meera@joshipharma.in", "+91 99001 22334"],
    ["arjun@acme.test", "Karthik Subramanian", "karthik@chennaisteel.in", "+91 94440 11223"],
    ["arjun@acme.test", "Deepa Menon", "deepa@kochispices.in", "+91 97450 66778"],
    ["manager@acme.test", "Neha Gupta", "neha@guptaexports.in", "+91 98989 89898"],
  ];
  contacts.forEach(([owner, name, email, phone], i) => {
    db.contacts.push({
      id: uid(),
      orgId,
      ownerId: ids[owner]!,
      name,
      email,
      phone,
      createdAt: minutesAgo(600 - i * 50),
    });
  });
  db.audit.push(
    { orgId, action: "create", entity: "organization", createdAt: minutesAgo(900) },
    { orgId, action: "accept_invite", entity: "user", createdAt: minutesAgo(700) },
    { orgId, action: "create", entity: "contact", createdAt: minutesAgo(300) },
  );
  return db;
}

let memory: Db | null = null;
function load(): Db {
  if (memory) return memory;
  const raw = storage.get(KEY);
  try {
    memory = raw ? (JSON.parse(raw) as Db) : seed();
  } catch {
    memory = seed();
  }
  return memory;
}
const save = () => memory && storage.set(KEY, JSON.stringify(memory));

export function resetDemo() {
  storage.remove(KEY);
  memory = null;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const deny = (status: number, message: string): never => {
  throw new HttpError(status, message);
};

function sessionOf(db: Db) {
  const user = db.users.find((u) => u.id === db.sessionUserId);
  if (!user) return deny(401, "Not authenticated");
  const role = db.roles.find((r) => r.id === user.roleId)!;
  return { user, role, orgId: user.orgId, perms: new Set(role.permissions) };
}
type Session = ReturnType<typeof sessionOf>;
const need = (s: Session, ...anyOf: string[]) => {
  if (!anyOf.some((p) => s.perms.has(p))) deny(403, "Forbidden");
};
const landing = (db: Db, user: User) => ({
  accessToken: "demo",
  landingRoute: db.roles.find((r) => r.id === user.roleId)?.landingRoute ?? "/my-workspace",
});
const audit = (db: Db, orgId: string, action: string, entity: string) =>
  db.audit.push({ orgId, action, entity, createdAt: now() });

// biome-ignore lint/suspicious/noExplicitAny: request bodies are validated by hand below
type Body = any;

function handle(method: string, path: string, body: Body): [number, unknown] {
  const db = load();
  const route = `${method} ${path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id")}`;

  switch (route) {
    case "POST /auth/login": {
      const matches = db.users.filter(
        (u) =>
          u.email === String(body.email).toLowerCase() &&
          (!body.orgSlug || db.orgs.find((o) => o.id === u.orgId)?.slug === body.orgSlug),
      );
      if (matches.length > 1) return deny(409, "This email belongs to several workspaces; choose one");
      const user = matches[0];
      if (!user || user.password !== body.password) return deny(401, "Invalid email or password");
      db.sessionUserId = user.id;
      return [200, landing(db, user)];
    }
    case "POST /auth/signup": {
      if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(body.slug ?? "") || String(body.password ?? "").length < 10)
        return deny(400, "Invalid request");
      if (db.orgs.some((o) => o.slug === body.slug)) return deny(409, "That workspace URL is taken");
      const orgId = uid();
      db.orgs.push({ id: orgId, name: body.orgName, slug: body.slug });
      let adminRole = "";
      for (const r of DEFAULT_ROLES) {
        const id = uid();
        if (r.key === "org_admin") adminRole = id;
        db.roles.push({
          id,
          orgId,
          name: r.name,
          landingRoute: r.landingRoute,
          permissions: [...r.permissions],
          isSystem: true,
        });
      }
      const pos = { id: uid(), orgId, name: "Founder" };
      db.positions.push(pos);
      const user = {
        id: uid(),
        orgId,
        email: String(body.email).toLowerCase(),
        name: body.name,
        password: body.password,
        roleId: adminRole,
        positionId: pos.id,
      };
      db.users.push(user);
      audit(db, orgId, "create", "organization");
      db.sessionUserId = user.id;
      return [201, { accessToken: "demo", landingRoute: "/admin" }];
    }
    case "POST /auth/refresh":
      return deny(401, "Not authenticated");
    case "POST /auth/logout":
      db.sessionUserId = null;
      return [200, { ok: true }];
    case "POST /auth/accept-invite": {
      const inv = db.invitations.find((i) => i.token === body.token && !i.acceptedAt);
      if (!inv) return deny(400, "Invitation is invalid or expired");
      if (String(body.password ?? "").length < 10) return deny(400, "Password must be at least 10 characters");
      inv.acceptedAt = now();
      const user = {
        id: uid(),
        orgId: inv.orgId,
        email: inv.email,
        name: body.name,
        password: body.password,
        roleId: inv.roleId,
        positionId: null,
      };
      db.users.push(user);
      audit(db, inv.orgId, "accept_invite", "user");
      db.sessionUserId = user.id;
      return [200, landing(db, user)];
    }
  }

  const s = sessionOf(db);
  const mine = <T extends { orgId: string }>(rows: T[]) => rows.filter((r) => r.orgId === s.orgId); // ≈ RLS

  switch (route) {
    case "GET /me": {
      const org = db.orgs.find((o) => o.id === s.orgId)!;
      const pos = db.positions.find((p) => p.id === s.user.positionId);
      return [
        200,
        {
          user: { id: s.user.id, name: s.user.name, email: s.user.email },
          org: { id: org.id, name: org.name, slug: org.slug },
          role: { id: s.role.id, name: s.role.name, landingRoute: s.role.landingRoute },
          position: pos ? { id: pos.id, name: pos.name } : null,
          permissions: s.role.permissions,
        },
      ];
    }
    case "GET /roles":
      need(s, "users.manage", "roles.manage");
      return [200, mine(db.roles).map(({ orgId: _, ...r }) => r)];
    case "POST /roles": {
      need(s, "roles.manage");
      if (
        !body.name ||
        String(body.name).length < 2 ||
        !LANDING_ROUTES.includes(body.landingRoute) ||
        !body.permissions?.length
      )
        return deny(400, "Give the role a name and at least one permission");
      if (mine(db.roles).some((r) => r.name === body.name)) return deny(409, "A role with that name exists");
      const id = uid();
      db.roles.push({
        id,
        orgId: s.orgId,
        name: body.name,
        landingRoute: body.landingRoute,
        permissions: body.permissions,
        isSystem: false,
      });
      audit(db, s.orgId, "create", "role");
      return [201, { id }];
    }
    case "GET /positions":
      return [200, mine(db.positions).map(({ id, name }) => ({ id, name }))];
    case "GET /users":
      need(s, "users.manage", "team.view");
      return [
        200,
        mine(db.users).map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          status: "active",
          roleId: u.roleId,
          roleName: db.roles.find((r) => r.id === u.roleId)!.name,
          positionName: db.positions.find((p) => p.id === u.positionId)?.name ?? null,
        })),
      ];
    case "PATCH /users/:id": {
      need(s, "users.manage");
      const user = mine(db.users).find((u) => u.id === path.split("/")[2]);
      if (!user) return deny(404, "Not found");
      if (body.roleId && mine(db.roles).some((r) => r.id === body.roleId)) user.roleId = body.roleId;
      audit(db, s.orgId, "update", "user");
      return [200, { id: user.id }];
    }
    case "GET /invitations":
      need(s, "users.manage");
      return [
        200,
        mine(db.invitations).map((i) => ({
          id: i.id,
          email: i.email,
          roleName: db.roles.find((r) => r.id === i.roleId)!.name,
          expiresAt: i.expiresAt,
          accepted: !!i.acceptedAt,
        })),
      ];
    case "POST /invitations": {
      need(s, "users.manage");
      const email = String(body.email ?? "").toLowerCase();
      if (!email.includes("@")) return deny(400, "Enter a valid email address");
      if (!mine(db.roles).some((r) => r.id === body.roleId) || mine(db.users).some((u) => u.email === email))
        return deny(400, "Unknown role, or user already a member");
      const token = uid().replaceAll("-", "") + uid().replaceAll("-", "");
      const id = uid();
      db.invitations.push({
        id,
        orgId: s.orgId,
        email,
        roleId: body.roleId,
        token,
        expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
        acceptedAt: null,
      });
      audit(db, s.orgId, "invite", "user");
      return [201, { id, token, invitePath: `/accept-invite?token=${token}` }];
    }
    case "GET /contacts": {
      need(s, "contacts.read.all", "contacts.read.own");
      const all = s.perms.has("contacts.read.all");
      return [
        200,
        mine(db.contacts)
          .filter((c) => all || c.ownerId === s.user.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(({ orgId: _o, createdAt: _c, ...c }) => c),
      ];
    }
    case "POST /contacts": {
      need(s, "contacts.write");
      if (!body.name) return deny(400, "Name is required");
      db.contacts.push({
        id: uid(),
        orgId: s.orgId,
        ownerId: s.user.id,
        name: body.name,
        email: body.email ?? null,
        phone: body.phone ?? null,
        createdAt: now(),
      });
      audit(db, s.orgId, "create", "contact");
      return [201, { id: uid() }];
    }
    case "GET /audit-log":
      need(s, "org.admin");
      return [200, mine(db.audit).reverse()];
  }

  const dash = path.match(/^\/dashboards\/([a-z-]+)$/);
  if (method === "GET" && dash) {
    const area = `/${dash[1]}` as LandingRoute;
    if (!LANDING_ROUTES.includes(area)) return deny(404, "Not found");
    need(s, ROUTE_PERMISSION[area]);
    const contacts = mine(db.contacts);
    switch (area) {
      case "/admin":
        return [
          200,
          {
            area,
            users: mine(db.users).length,
            roles: mine(db.roles).length,
            pendingInvites: mine(db.invitations).filter((i) => !i.acceptedAt).length,
            recentAudit: mine(db.audit).slice(-8).reverse(),
          },
        ];
      case "/team": {
        const counts = new Map<string | null, number>();
        for (const c of contacts) {
          const owner = db.users.find((u) => u.id === c.ownerId)?.name ?? null;
          counts.set(owner, (counts.get(owner) ?? 0) + 1);
        }
        return [
          200,
          {
            area,
            contacts: contacts.length,
            byOwner: [...counts].map(([owner, n]) => ({ owner, contacts: n })).sort((a, b) => b.contacts - a.contacts),
          },
        ];
      }
      case "/my-workspace":
        return [200, { area, myContacts: contacts.filter((c) => c.ownerId === s.user.id).length }];
      case "/inbox":
        return [200, { area, openConversations: 0 }];
      case "/invoicing":
        return [200, { area, outstandingInr: 0 }];
    }
  }
  return deny(404, "Not found");
}

export function installDemoApi() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url, window.location.href).pathname;
    const at = path.indexOf("/api/v1/");
    if (at < 0) return realFetch(input, init);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    await new Promise((r) => setTimeout(r, 120));
    let status: number;
    let payload: unknown;
    try {
      [status, payload] = handle(method, path.slice(at + 7), body);
      save();
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
      status = e.status;
      payload = { error: e.message };
    }
    return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
  };
}
