import { defineConfig, devices } from "@playwright/test";
import { BASE_URLS, serverWebServer, webappWebServer } from "./servers";

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
    serverWebServer("standard"),
    webappWebServer("standard"),
    serverWebServer("waitlist"),
    webappWebServer("waitlist"),
  ],
  projects: [
    {
      name: "standard",
      // exact filenames — a broad regex would also match the expo-*.spec files
      testMatch: [
        "standard.spec.ts",
        "email.spec.ts",
        // m5k:files:start
        "files.spec.ts",
        // m5k:files:end
        // m5k:workflows:start
        "workflow.spec.ts",
        // m5k:workflows:end
      ],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: BASE_URLS.standard,
      },
    },
    {
      name: "waitlist",
      testMatch: ["waitlist.spec.ts", "email.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: BASE_URLS.waitlist,
      },
    },
  ],
});
