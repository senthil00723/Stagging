import { expect, test } from "@playwright/test";
import { generate } from "otplib";
import postgres from "postgres";

const ADMIN = "http://localhost:5174";
const WEB = "http://localhost:5173";

test("super-admin: password + mandatory TOTP, then tenant console; tokens don't cross portals", async ({ page }) => {
  // Fresh admin each run so first-login enrolment is exercised.
  const sql = postgres(process.env.MIGRATION_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/g3leads");
  await sql`update platform_admins set totp_secret = null, totp_pending = null where email = 'root@g3leads.local'`;
  await sql.end();

  await page.goto(ADMIN);
  await page.getByLabel("Email").fill("root@g3leads.local");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Continue" }).click();

  const uri = (await page.getByTestId("otpauth").textContent())!;
  await page.screenshot({ path: "../docs/screenshots/superadmin-2fa.png" });
  const secret = new URL(uri).searchParams.get("secret")!;
  await page.getByLabel("Authentication code").fill(await generate({ secret }));
  await page.getByRole("button", { name: "Verify" }).click();

  await expect(page.getByRole("cell", { name: "Acme Traders Pvt Ltd" })).toBeVisible();
  await page.screenshot({ path: "../docs/screenshots/superadmin-tenants.png", fullPage: true });

  // The admin session cookie is scoped to /admin-api and is useless on tenant endpoints.
  const tenantCall = await page.request.get(`${WEB}/api/v1/me`);
  expect(tenantCall.status()).toBe(401);
});
