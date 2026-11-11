import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { scaffoldProject } from "../create";

describe("PostHog generated app", () => {
  let tempRoot: string;
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-posthog-"));
  });
  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("ships browser/backend capture and private upload configuration across environments", async () => {
    const result = await scaffoldProject({
      targetDirectory: path.join(tempRoot, "posthog-app"),
      appName: "PostHog App",
      appDescription: "Error tracking fixture",
      environments: ["staging", "canary"],
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });
    const read = (file: string) => fs.readFile(path.join(result.targetDirectory, file), "utf8");
    const layout = await read("apps/webapp/src/Layout.tsx");
    expect(layout).not.toContain("m5k:");
    expect(layout).not.toContain("NotificationSidebarInbox");
    expect(layout).not.toContain("BellIcon");
    await expect(
      fs.stat(path.join(result.targetDirectory, "apps/webapp/src/modules/notification"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    const webappPackage = JSON.parse(await read("apps/webapp/package.json"));
    expect(webappPackage.devDependencies["@types/node"]).toBe("catalog:m5kdev");
    const workspace = parse(await read("pnpm-workspace.yaml"));
    // The Node SDK stays an internal Kernel dependency, not an app-facing pin.
    expect(workspace.catalogs.m5kdev["posthog-node"]).toBeUndefined();
    expect(workspace.catalogs.m5kdev["@posthog/rollup-plugin"]).toBe("1.6.4");
    expect(workspace.catalogs.m5kdev["@sentry/node"]).toBeUndefined();
    for (const file of [
      "apps/shared/.env",
      "apps/shared/.env.example",
      ...["development", "staging", "canary", "production"].map(
        (env) => `apps/shared/.env.${env}.example`
      ),
    ]) {
      const source = await read(file);
      expect(source).toMatch(/^POSTHOG_API_KEY=$/m);
      expect(source).toMatch(/^POSTHOG_PROJECT_ID=$/m);
      expect(source).toMatch(/^POSTHOG_HOST=https:\/\/us.posthog.com$/m);
      expect(source).not.toContain("VITE_POSTHOG_API_KEY");
    }
    expect(await read("apps/server/src/instrumentation.ts")).toContain("initPosthog()");
    expect(await read("apps/server/src/app.ts")).toContain("shutdownPosthog()");
    expect(await read("apps/webapp/src/Providers.tsx")).toContain("AppErrorBoundary");
    expect(await read("apps/webapp/src/utils/posthog.utils.ts")).toContain(
      "capture_unhandled_rejections: true"
    );
    expect(await read("apps/webapp/vite.config.ts")).toContain("@posthog/rollup-plugin");
    expect(await read("apps/shared/Dockerfile")).toContain("type=secret,id=ALL_SECRETS");
    const turbo = JSON.parse(await read("turbo.json"));
    expect(turbo.tasks.build.env).toEqual(
      expect.arrayContaining(["VITE_*", "POSTHOG_API_KEY", "POSTHOG_PROJECT_ID", "POSTHOG_HOST"])
    );
    expect(await read("docs/deployment.md")).toContain("PostHog errors and source maps");
    expect(await read("apps/docs/docs/index.md")).toContain("Reload page");
  });
});
