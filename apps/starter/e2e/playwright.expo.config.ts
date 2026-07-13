import { defineConfig, devices } from "@playwright/test";
import { EXPO_BASE_URLS, expoWebServer, serverWebServer } from "./servers";

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
    serverWebServer("standard", { expo: true }),
    expoWebServer("standard"),
    serverWebServer("waitlist", { expo: true }),
    expoWebServer("waitlist"),
  ],
  projects: [
    {
      name: "expo-standard",
      testMatch: /.*expo-standard\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: EXPO_BASE_URLS.standard,
      },
    },
    {
      name: "expo-waitlist",
      testMatch: /.*expo-waitlist\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: EXPO_BASE_URLS.waitlist,
      },
    },
  ],
});
