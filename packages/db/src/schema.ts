// Drizzle mirror of migrations/*.sql (SQL is the source of truth because RLS
// policies, DB roles and SECURITY DEFINER functions live there).
import { bigserial, boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const platformAdmins = pgTable("platform_admins", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull(),
  name: text().notNull(),
  passwordHash: text("password_hash").notNull(),
  totpSecret: text("totp_secret"),
  totpPending: text("totp_pending"),
  createdAt: createdAt(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const platformAuditLog = pgTable("platform_audit_log", {
  id: bigserial({ mode: "number" }).primaryKey(),
  adminId: uuid("admin_id"),
  action: text().notNull(),
  target: text(),
  meta: jsonb().notNull().default({}),
  ip: text(),
  createdAt: createdAt(),
});

export const organizations = pgTable("organizations", {
  id: uuid().primaryKey(),
  name: text().notNull(),
  slug: text().notNull(),
  status: text().$type<"active" | "suspended">().notNull().default("active"),
  createdAt: createdAt(),
});

export const roles = pgTable("roles", {
  id: uuid().primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  key: text(),
  name: text().notNull(),
  landingRoute: text("landing_route").notNull(),
  permissions: text().array().notNull().default([]),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: createdAt(),
});

export const positions = pgTable("positions", {
  id: uuid().primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  name: text().notNull(),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  email: text().notNull(),
  name: text().notNull(),
  passwordHash: text("password_hash").notNull(),
  roleId: uuid("role_id").notNull(),
  positionId: uuid("position_id"),
  status: text().$type<"active" | "disabled">().notNull().default("active"),
  createdAt: createdAt(),
});

export const invitations = pgTable("invitations", {
  id: uuid().primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  email: text().notNull(),
  roleId: uuid("role_id").notNull(),
  positionId: uuid("position_id"),
  tokenHash: text("token_hash").notNull(),
  invitedBy: uuid("invited_by"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid().primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  userId: uuid("user_id").notNull(),
  familyId: uuid("family_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const contacts = pgTable("contacts", {
  id: uuid().primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  ownerId: uuid("owner_id"),
  name: text().notNull(),
  email: text(),
  phone: text(),
  createdAt: createdAt(),
});

export const auditLog = pgTable("audit_log", {
  id: bigserial({ mode: "number" }).primaryKey(),
  orgId: uuid("org_id").notNull(),
  actorId: uuid("actor_id"),
  action: text().notNull(),
  entity: text().notNull(),
  entityId: text("entity_id"),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  createdAt: createdAt(),
});
