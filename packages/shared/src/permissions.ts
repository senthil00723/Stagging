/**
 * Permission catalogue. Roles are data (stored per tenant) and reference these
 * keys; the API re-checks them on every request. The frontend only uses them
 * to decide what to render.
 */
export const PERMISSIONS = {
  "org.admin": "Access the organization admin console",
  "users.manage": "Invite and manage users",
  "roles.manage": "Create and edit roles and positions",
  "team.view": "View team-wide pipeline and reports",
  "contacts.read.all": "Read every contact in the organization",
  "contacts.read.own": "Read contacts you own",
  "contacts.write": "Create and edit contacts",
  "inbox.view": "Access the support inbox",
  "billing.view": "View invoices, payments and GST reports",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

export interface DefaultRole {
  key: string;
  name: string;
  landingRoute: string;
  permissions: Permission[];
}

/** Seeded into every new organization; tenants can edit or add their own. */
export const DEFAULT_ROLES: DefaultRole[] = [
  {
    key: "org_admin",
    name: "Org Admin",
    landingRoute: "/admin",
    permissions: [...PERMISSION_KEYS],
  },
  {
    key: "sales_manager",
    name: "Sales Manager",
    landingRoute: "/team",
    permissions: ["team.view", "contacts.read.all", "contacts.read.own", "contacts.write"],
  },
  {
    key: "sales_executive",
    name: "Sales Executive",
    landingRoute: "/my-workspace",
    permissions: ["contacts.read.own", "contacts.write"],
  },
  {
    key: "support_agent",
    name: "Support Agent",
    landingRoute: "/inbox",
    permissions: ["inbox.view", "contacts.read.all"],
  },
  {
    key: "finance",
    name: "Finance / Billing",
    landingRoute: "/invoicing",
    permissions: ["billing.view"],
  },
];

/** Routes a tenant may pick as a role's landing page. */
export const LANDING_ROUTES = ["/admin", "/team", "/my-workspace", "/inbox", "/invoicing"] as const;
export type LandingRoute = (typeof LANDING_ROUTES)[number];

/** Which permission a landing route requires (used by both API and UI). */
export const ROUTE_PERMISSION: Record<LandingRoute, Permission> = {
  "/admin": "org.admin",
  "/team": "team.view",
  "/my-workspace": "contacts.read.own",
  "/inbox": "inbox.view",
  "/invoicing": "billing.view",
};
