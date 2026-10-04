/**
 * End-to-end tests run the built server (which also serves the built web app) against a fresh database with
 * the demo tenant, and drive Chromium on the tenant's sub-domain (*.localhost resolves to this machine).
 * The global setup prepares the database and starts the server (Playwright's webServer would start too early).
 */
import { defineConfig, devices } from "@playwright/test";
import { E2E } from "./env.ts";

export default defineConfig({
  testDir: "tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./global-setup.ts",
  use: { baseURL: E2E.tenantUrl, trace: "retain-on-failure", screenshot: "only-on-failure", locale: "en-IN", timezoneId: "Asia/Kolkata" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
