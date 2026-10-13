/**
 * Dev seed: one platform admin + a demo tenant ("acme") with one user per
 * default role, so every landing dashboard can be tried immediately.
 * Runs over the migration (owner) connection, never in production.
 */
import { randomUUID } from "node:crypto";
import { createDb, eq, schema } from "@g3/db";
import { DEFAULT_ROLES } from "@g3/shared";
import { hashPassword } from "./lib/crypto.ts";

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error("MIGRATION_DATABASE_URL is required");
if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed production");

const PASSWORD = "Password123!";
const { db, close } = createDb(url, 1);

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "root@g3leads.local";
const [existingAdmin] = await db
  .select()
  .from(schema.platformAdmins)
  .where(eq(schema.platformAdmins.email, adminEmail));
if (!existingAdmin) {
  await db.insert(schema.platformAdmins).values({
    email: adminEmail,
    name: "Platform Root",
    passwordHash: await hashPassword(PASSWORD),
  });
  console.log(`platform admin: ${adminEmail} / ${PASSWORD} (TOTP enrolment on first login)`);
}

const [acme] = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, "acme"));
if (!acme) {
  const orgId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(schema.organizations).values({ id: orgId, name: "Acme Traders Pvt Ltd", slug: "acme" });
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
      .returning();
    const hash = await hashPassword(PASSWORD);
    const people = [
      ["org_admin", "Asha Admin", "admin@acme.test", "Founder"],
      ["sales_manager", "Manoj Manager", "manager@acme.test", "Sales Head"],
      ["sales_executive", "Riya Rep", "rep@acme.test", "Sales Executive"],
      ["support_agent", "Sanjay Support", "support@acme.test", "Support Agent"],
      ["finance", "Farah Finance", "finance@acme.test", "Accountant"],
    ] as const;
    const ids: Record<string, string> = {};
    for (const [key, name, email, position] of people) {
      const [pos] = await tx.insert(schema.positions).values({ orgId, name: position }).returning();
      const [u] = await tx
        .insert(schema.users)
        .values({
          orgId,
          name,
          email,
          passwordHash: hash,
          roleId: roles.find((r) => r.key === key)!.id,
          positionId: pos!.id,
        })
        .returning();
      ids[key] = u!.id;
    }
    await tx.insert(schema.contacts).values([
      {
        orgId,
        ownerId: ids.sales_executive,
        name: "Priya Sharma",
        email: "priya@kiranastores.in",
        phone: "+919876543210",
      },
      {
        orgId,
        ownerId: ids.sales_executive,
        name: "Rahul Verma",
        email: "rahul@vermatextiles.in",
        phone: "+919812345678",
      },
      { orgId, ownerId: ids.sales_manager, name: "Neha Gupta", email: "neha@guptaexports.in", phone: "+919898989898" },
    ]);
  });
  console.log(`tenant "acme": admin|manager|rep|support|finance@acme.test / ${PASSWORD}`);
}
await close();
