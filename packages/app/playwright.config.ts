import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests of the first-launch setup in script mode (Milestone 13). Each test starts
 * its own app server with a temporary LOXORA_HOME, so the real user folders are never used.
 * Run `npm run build` first; `npm run test:app:e2e` does both.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  workers: 1,
  use: {
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 800 },
  },
});
