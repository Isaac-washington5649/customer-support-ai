import { defineConfig } from "@playwright/test";
import path from "node:path";

const PORT = process.env.PORT || 3000;

export default defineConfig({
  testDir: "./tests/e2e",
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run dev -- --hostname 0.0.0.0 --port ${PORT}`,
    cwd: path.resolve(__dirname),
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001",
      API_SECRET: process.env.API_SECRET ?? "demo-secret",
      NODE_ENV: "test",
    },
  },
});
