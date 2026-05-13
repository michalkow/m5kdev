import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "on-first-retry",
  },
  webServer: [
    {
      command:
        "pnpm --filter @m5kdev/auth-e2e-server prepare:standard && pnpm --filter @m5kdev/auth-e2e-server dev:standard",
      url: "http://127.0.0.1:18180/__emails",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @m5kdev/auth-e2e-webapp dev:standard",
      url: "http://127.0.0.1:15173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command:
        "pnpm --filter @m5kdev/auth-e2e-server prepare:waitlist && pnpm --filter @m5kdev/auth-e2e-server dev:waitlist",
      url: "http://127.0.0.1:18181/__emails",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @m5kdev/auth-e2e-webapp dev:waitlist",
      url: "http://127.0.0.1:15174",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "standard",
      testMatch: /.*(standard|email)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:15173",
      },
    },
    {
      name: "waitlist",
      testMatch: /.*(waitlist|email)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:15174",
      },
    },
  ],
});
