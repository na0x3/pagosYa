import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4323",
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
    headless: true,
  },
  webServer: {
    command: "node server.mjs",
    url: "http://127.0.0.1:4323",
    reuseExistingServer: !process.env.CI,
  },
});
