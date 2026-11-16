// End-to-end tests: `bun run e2e` (not part of `bun run check`).
// Builds and starts its own production server on E2E_PORT (3211) against a throwaway database,
// phone-sized Chromium by default. See e2e/fixtures.ts and AGENTS.md.
import { defineConfig, devices } from "@playwright/test";
import { E2E_DIR, E2E_ORIGIN, E2E_PORT } from "./e2e/env";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  workers: process.env.CI ? 1 : 2,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices["Pixel 7"],
    baseURL: E2E_ORIGIN,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
  },
  projects: [
    // Accepts the startup bootstrap invite and stores the admin's session.
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "phone",
      testMatch: /.*\.e2e\.ts/,
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "bun e2e/server.ts",
    url: `${E2E_ORIGIN}/health`,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
    env: { E2E_PORT: String(E2E_PORT), E2E_DIR },
  },
});
