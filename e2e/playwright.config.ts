import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against the running stack (pnpm dev + seeded DB). In CI the web
 * servers are started by `webServer`; locally reuse what's already running.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 860 } } }],
  webServer: [
    {
      command: "pnpm --filter @g3/api start",
      url: "http://localhost:4000/health",
      reuseExistingServer: true,
      cwd: "..",
    },
    { command: "pnpm --filter @g3/web dev", url: "http://localhost:5173", reuseExistingServer: true, cwd: ".." },
    { command: "pnpm --filter @g3/admin dev", url: "http://localhost:5174", reuseExistingServer: true, cwd: ".." },
  ],
});
