import { defineConfig } from "@playwright/test";

/**
 * Check A against Xora's real model (Milestone 16, delivery 2). Only for a local run on the
 * captain's computer: the model must already run, by default at http://127.0.0.1:8080.
 * Automatic tests and CI use the runtime double only (Milestone 16 section 8), so this
 * folder is not part of `playwright.config.ts`. Run it with `npm run test:xora:live`.
 */
export default defineConfig({
  testDir: "./e2e-live",
  // The model answers slowly on a laptop: a whole Check A can take several minutes.
  timeout: 15 * 60_000,
  expect: { timeout: 120_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 800 },
    locale: "de-DE",
  },
});
