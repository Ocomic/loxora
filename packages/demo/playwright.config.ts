import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "jury-1280", use: { viewport: { width: 1280, height: 720 } } },
    { name: "jury-1440", use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: "npm --prefix ../.. run demo:start",
    url: "http://127.0.0.1:4173/api/demo/status",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
