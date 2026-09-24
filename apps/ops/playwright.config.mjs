import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4396",
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
    headless: true,
  },
  webServer: {
    command: "node server.mjs",
    url: "http://127.0.0.1:4396",
    env: { PORT: "4396", OPS_LIVE_RELOAD: "0" },
    reuseExistingServer: !process.env.CI,
  },
});
