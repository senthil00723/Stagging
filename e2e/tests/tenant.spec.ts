import { expect, type Page, test } from "@playwright/test";

const WEB = "http://localhost:5173";
const shots = (name: string) => `../docs/screenshots/${name}.png`;

async function login(page: Page, email: string) {
  await page.goto(`${WEB}/login`);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("three roles share one login page and land on three dashboards", async ({ browser }) => {
  const cases = [
    ["admin@acme.test", "/admin", "Admin console"],
    ["manager@acme.test", "/team", "Team pipeline"],
    ["rep@acme.test", "/my-workspace", "My workspace"],
  ] as const;
  for (const [email, path, heading] of cases) {
    const page = await (await browser.newContext()).newPage();
    await login(page, email);
    await expect(page).toHaveURL(WEB + path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: shots(`dashboard-${path.slice(1)}`), fullPage: true });
    await page.context().close();
  }
});

test("a rep who types /admin sees a forbidden page and the API refuses too", async ({ page }) => {
  await login(page, "rep@acme.test");
  await expect(page).toHaveURL(`${WEB}/my-workspace`);
  await page.goto(`${WEB}/admin`);
  await expect(page.getByTestId("forbidden")).toBeVisible();
  const res = await page.request.get(`${WEB}/api/v1/users`);
  expect(res.status()).toBe(403);
});

test("signup → invite teammate → teammate joins and lands on their role page", async ({ page, browser }) => {
  const slug = `e2e-${Date.now().toString(36)}`;
  await page.goto(`${WEB}/signup`);
  await page.getByLabel("Company name").fill("Sharma Electricals");
  await page.getByLabel("Workspace URL").fill(slug);
  await page.getByLabel("Your name").fill("Vikram Sharma");
  await page.getByLabel("Work email").fill(`vikram@${slug}.test`);
  await page.getByLabel("Password").fill("Password123!");
  await page.screenshot({ path: shots("signup") });
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(`${WEB}/admin`);

  const invite = page.locator("form").filter({ has: page.getByRole("button", { name: "Invite teammate" }) });
  await invite.getByLabel("Work email").fill(`sales@${slug}.test`);
  await invite.getByLabel("Role").selectOption({ label: "Sales Executive" });
  await invite.getByRole("button", { name: "Invite teammate" }).click();
  const link = (await page.getByTestId("invite-link").textContent())!;
  await page.screenshot({ path: shots("admin-invite"), fullPage: true });

  const other = await (await browser.newContext()).newPage();
  await other.goto(link);
  await other.getByLabel("Your name").fill("Pooja Rep");
  await other.getByLabel("Password").fill("Password123!");
  await other.getByRole("button", { name: "Join workspace" }).click();
  await expect(other).toHaveURL(`${WEB}/my-workspace`);

  await other.getByLabel("Name").fill("Kirana King Stores");
  await other.getByLabel("Phone").fill("+919800000000");
  await other.getByRole("button", { name: "Add contact" }).click();
  await expect(other.getByRole("cell", { name: "Kirana King Stores" })).toBeVisible();
});

test("login page renders in Hindi", async ({ page }) => {
  await page.goto(`${WEB}/login`);
  await page.evaluate(() => localStorage.setItem("g3.lang", "hi"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "अपने वर्कस्पेस में साइन इन करें" })).toBeVisible();
  await page.screenshot({ path: shots("login-hindi") });
});
