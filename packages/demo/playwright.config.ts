import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  webServer: {
    command: "npm --prefix ../.. run demo:start",
    url: "http://127.0.0.1:4173/api/demo/status",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
