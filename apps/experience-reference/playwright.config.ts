import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: {
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHANNEL,
    headless: true,
    launchOptions: {
      args: ["--host-resolver-rules=MAP *.test 127.0.0.1", "--no-proxy-server"],
    },
  },
  outputDir: `${process.env.REFERENCE_ARTIFACT_ROOT ?? "/tmp/m5kdev-implement-88/99-artifacts"}/playwright`,
  timeout: 60000,
});
