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
        "pnpm --filter m5kdev-auth-e2e-server prepare:expo:standard && pnpm --filter m5kdev-auth-e2e-server dev:expo:standard",
      url: "http://127.0.0.1:18182/__emails",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter m5kdev-auth-e2e-expo dev:standard",
      url: "http://127.0.0.1:15183",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command:
        "pnpm --filter m5kdev-auth-e2e-server prepare:expo:waitlist && pnpm --filter m5kdev-auth-e2e-server dev:expo:waitlist",
      url: "http://127.0.0.1:18183/__emails",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter m5kdev-auth-e2e-expo dev:waitlist",
      url: "http://127.0.0.1:15184",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
  projects: [
    {
      name: "expo-standard",
      testMatch: /.*expo-standard\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:15183",
      },
    },
    {
      name: "expo-waitlist",
      testMatch: /.*expo-waitlist\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:15184",
      },
    },
  ],
});
