import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { scaffoldProject } from "../create";
import * as fsHelpers from "../fs";

describe("scaffoldProject", () => {
  let tempRoot = "";
  let initialCwd = "";

  beforeEach(async () => {
    initialCwd = process.cwd();
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-cli-"));
    process.chdir(tempRoot);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    process.chdir(initialCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("creates the minimal starter and replaces placeholders", async () => {
    const result = await scaffoldProject({
      targetDirectory: "editorial-desk",
      appName: "Editorial Desk",
      appDescription: "A clean newsroom starter.",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    await expect(fs.stat(path.join(result.targetDirectory, "AGENTS.md"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(result.targetDirectory, "CLAUDE.md"))).resolves.toBeTruthy();
    await expect(
      fs.stat(path.join(result.targetDirectory, "apps/server/src/modules/posts/posts.service.ts"))
    ).resolves.toBeTruthy();
    await expect(
      fs.stat(path.join(result.targetDirectory, "apps/webapp/src/modules/posts/PostsRoute.tsx"))
    ).resolves.toBeTruthy();

    const rootPackage = await fs.readFile(
      path.join(result.targetDirectory, "package.json"),
      "utf8"
    );
    const rootAgents = await fs.readFile(path.join(result.targetDirectory, "AGENTS.md"), "utf8");
    const sharedEnv = await fs.readFile(
      path.join(result.targetDirectory, "apps/shared/.env"),
      "utf8"
    );
    const appConstants = await fs.readFile(
      path.join(result.targetDirectory, "apps/shared/src/modules/app/app.constants.ts"),
      "utf8"
    );
    // global providers are composed in App.tsx
    const providers = await fs.readFile(
      path.join(result.targetDirectory, "apps/webapp/src/App.tsx"),
      "utf8"
    );
    const appTs = await fs.readFile(
      path.join(result.targetDirectory, "apps/server/src/app.ts"),
      "utf8"
    );

    expect(rootPackage).toContain('"name": "editorial-desk"');
    expect(rootAgents).toContain("Editorial Desk");
    expect(rootAgents).toContain("A clean newsroom starter.");

    const rootClaude = await fs.readFile(path.join(result.targetDirectory, "CLAUDE.md"), "utf8");
    expect(rootClaude).toContain("Editorial Desk");
    expect(rootClaude).toContain("A clean newsroom starter.");
    expect(rootClaude).toContain(".cursor/rules/module-db-guide.mdc");
    expect(rootClaude).toContain("`apps/webapp`");
    // web platform without the test harness: expo and e2e marker blocks are stripped
    expect(rootClaude).not.toContain("apps/expo");
    expect(rootClaude).not.toContain("apps/e2e");
    expect(rootClaude).not.toContain("m5k:");
    expect(sharedEnv).toContain("VITE_APP_NAME=Editorial Desk");
    expect(sharedEnv).not.toContain("{{APP_NAME}}");
    expect(appConstants).toContain('APP_NAME = "Editorial Desk"');
    expect(appConstants).toContain('APP_SLUG = "editorial-desk"');
    expect(providers).toContain("AppConfigProvider");
    expect(providers).toContain("AppTrpcQueryProvider");
    expect(appTs).toContain("createBackendApp(");
    expect(appTs).not.toContain(".build()");
    expect(appTs).not.toContain("cors(");
    expect(appTs).not.toContain("express.json");
    expect(appTs).toContain("onShutdown");

    const indexTs = await fs.readFile(
      path.join(result.targetDirectory, "apps/server/src/index.ts"),
      "utf8"
    );
    expect(indexTs).toContain('import "./instrumentation"');
    expect(indexTs).toContain("builtBackendApp.start()");
    expect(indexTs).not.toContain("SIGINT");
    expect(indexTs).not.toContain(".listen(");

    const emailPackage = await fs.readFile(
      path.join(result.targetDirectory, "apps/email/package.json"),
      "utf8"
    );
    const workspaceYaml = await fs.readFile(
      path.join(result.targetDirectory, "pnpm-workspace.yaml"),
      "utf8"
    );

    expect(emailPackage).not.toMatch(/"@m5kdev\/[^"]+": "workspace:\*"/);
    expect(emailPackage).toContain('"@m5kdev/email": "catalog:m5kdev"');
    expect(emailPackage).not.toContain('"@m5kdev/email": "catalog:"');
    expect(workspaceYaml).toMatch(/^catalogs:\n(?: {2}.*\n)* {2}m5kdev:/m);
    expect(workspaceYaml).toContain('"@m5kdev/email":');
    expect(workspaceYaml).toContain("drizzle-orm:");

    const managedStateSource = await fs.readFile(
      path.join(result.targetDirectory, ".m5kdev.json"),
      "utf8"
    );
    const managedState = JSON.parse(managedStateSource) as {
      template: { features: string[]; context: Record<string, unknown> };
      catalog: Record<string, string>;
    };
    expect(managedState.template.features).toEqual(["webapp"]);
    expect(managedState.catalog).not.toHaveProperty("react-native-web");
    expect(managedState.template.context).not.toHaveProperty("betterAuthSecret");
    expect(managedStateSource).not.toContain("BETTER_AUTH_SECRET");
  });

  it("defaults --yes to web always-on modules without optional Backend Modules", async () => {
    const result = await scaffoldProject({
      targetDirectory: "always-on-desk",
      appName: "Always On Desk",
      appDescription: "Always-on composition fixture.",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    const appTs = await fs.readFile(
      path.join(result.targetDirectory, "apps/server/src/app.ts"),
      "utf8"
    );
    expect(appTs).toContain("AuthModule");
    expect(appTs).toContain("EmailModule");
    expect(appTs).toContain("PostsModule");
    expect(appTs).not.toContain("WorkflowModule");
    expect(appTs).not.toContain("DemoWorkflowModule");
    expect(appTs).not.toContain("NotificationModule");
    expect(appTs).not.toContain("redis:");
    expect(appTs).not.toContain("m5k:");

    const schema = await fs.readFile(
      path.join(result.targetDirectory, "apps/server/src/schema.ts"),
      "utf8"
    );
    expect(schema).not.toContain('from "@m5kdev/backend/modules/workflow/workflow.db"');
    expect(schema).not.toContain('from "@m5kdev/backend/modules/notification/notification.db"');
    expect(schema).not.toContain("m5k:");

    const serverPackage = await fs.readFile(
      path.join(result.targetDirectory, "apps/server/package.json"),
      "utf8"
    );
    expect(serverPackage).not.toContain("@m5kdev/module-");
    expect(appTs).not.toContain("PdfModule");
    expect(appTs).not.toContain("DocxModule");

    const serverAgents = await fs.readFile(
      path.join(result.targetDirectory, "apps/server/AGENTS.md"),
      "utf8"
    );
    expect(serverAgents).not.toContain("NotificationModule");

    const router = await fs.readFile(
      path.join(result.targetDirectory, "apps/webapp/src/Router.tsx"),
      "utf8"
    );
    expect(router).not.toContain("WorkflowsRoute");
    expect(router).not.toContain('path="workflows"');

    await expect(
      fs.stat(
        path.join(result.targetDirectory, "apps/webapp/src/modules/workflows/WorkflowsRoute.tsx")
      )
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.stat(
        path.join(
          result.targetDirectory,
          "apps/server/src/modules/demo-workflow/demo-workflow.module.ts"
        )
      )
    ).rejects.toMatchObject({ code: "ENOENT" });

    const source = await fs.readFile(path.join(result.targetDirectory, ".m5kdev.json"), "utf8");
    const state = JSON.parse(source) as { template: { features: string[] } };
    expect(state.template.features).toEqual(["webapp"]);
  });

  it("omits Files unless that Backend Module is selected", async () => {
    const off = await scaffoldProject({
      targetDirectory: "files-off-desk",
      appName: "Files Off Desk",
      appDescription: "Files module omitted fixture.",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    const offApp = await fs.readFile(path.join(off.targetDirectory, "apps/server/src/app.ts"), "utf8");
    expect(offApp).not.toContain("FileModule");
    expect(offApp).not.toContain("m5k:");

    const offSchema = await fs.readFile(
      path.join(off.targetDirectory, "apps/server/src/schema.ts"),
      "utf8"
    );
    expect(offSchema).not.toContain('from "@m5kdev/backend/modules/file/file.db"');

    const offRouter = await fs.readFile(
      path.join(off.targetDirectory, "apps/webapp/src/Router.tsx"),
      "utf8"
    );
    expect(offRouter).not.toContain("FilesRoute");
    expect(offRouter).not.toContain('path="files"');

    await expect(
      fs.stat(path.join(off.targetDirectory, "apps/webapp/src/modules/files/FilesRoute.tsx"))
    ).rejects.toMatchObject({ code: "ENOENT" });

    const on = await scaffoldProject({
      targetDirectory: "files-on-desk",
      appName: "Files On Desk",
      appDescription: "Files module fixture.",
      yes: true,
      modules: ["files"],
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    const onApp = await fs.readFile(path.join(on.targetDirectory, "apps/server/src/app.ts"), "utf8");
    expect(onApp).toContain("FileModule");
    expect(onApp).not.toContain("m5k:");

    const onSchema = await fs.readFile(
      path.join(on.targetDirectory, "apps/server/src/schema.ts"),
      "utf8"
    );
    expect(onSchema).toContain("files");
    expect(onSchema).not.toContain("m5k:");

    const onRouter = await fs.readFile(
      path.join(on.targetDirectory, "apps/webapp/src/Router.tsx"),
      "utf8"
    );
    expect(onRouter).toContain("FilesRoute");
    expect(onRouter).toContain('path="files"');

    await expect(
      fs.stat(path.join(on.targetDirectory, "apps/webapp/src/modules/files/FilesRoute.tsx"))
    ).resolves.toBeTruthy();

    const source = await fs.readFile(path.join(on.targetDirectory, ".m5kdev.json"), "utf8");
    const state = JSON.parse(source) as { template: { features: string[] } };
    expect(state.template.features).toEqual(["files", "webapp"]);
  });

  it("keeps Workflows when that Backend Module is selected", async () => {
    const result = await scaffoldProject({
      targetDirectory: "workflow-desk",
      appName: "Workflow Desk",
      appDescription: "Workflows module fixture.",
      yes: true,
      modules: ["workflows"],
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    const appTs = await fs.readFile(
      path.join(result.targetDirectory, "apps/server/src/app.ts"),
      "utf8"
    );
    expect(appTs).toContain("WorkflowModule");
    expect(appTs).toContain("DemoWorkflowModule");
    expect(appTs).toContain('defaultQueue: "fast"');
    expect(appTs).toContain("redis:");
    expect(appTs).not.toContain("m5k:");

    const schema = await fs.readFile(
      path.join(result.targetDirectory, "apps/server/src/schema.ts"),
      "utf8"
    );
    expect(schema).toContain("workflows");
    expect(schema).not.toContain('from "@m5kdev/backend/modules/notification/notification.db"');
    expect(schema).not.toContain("m5k:");
    expect(appTs).not.toContain("NotificationModule");

    const router = await fs.readFile(
      path.join(result.targetDirectory, "apps/webapp/src/Router.tsx"),
      "utf8"
    );
    expect(router).toContain("WorkflowsRoute");
    expect(router).toContain('path="workflows"');

    await expect(
      fs.stat(
        path.join(result.targetDirectory, "apps/webapp/src/modules/workflows/WorkflowsRoute.tsx")
      )
    ).resolves.toBeTruthy();
    await expect(
      fs.stat(
        path.join(
          result.targetDirectory,
          "apps/server/src/modules/demo-workflow/demo-workflow.module.ts"
        )
      )
    ).resolves.toBeTruthy();

    const source = await fs.readFile(path.join(result.targetDirectory, ".m5kdev.json"), "utf8");
    const state = JSON.parse(source) as { template: { features: string[] } };
    expect(state.template.features).toEqual(["webapp", "workflows"]);
  });

  it("keeps Notifications when that Backend Module is selected", async () => {
    const result = await scaffoldProject({
      targetDirectory: "notification-desk",
      appName: "Notification Desk",
      appDescription: "Notifications module fixture.",
      yes: true,
      modules: ["workflows", "notifications"],
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    const appTs = await fs.readFile(
      path.join(result.targetDirectory, "apps/server/src/app.ts"),
      "utf8"
    );
    expect(appTs).toContain("NotificationModule");
    expect(appTs).toContain("WorkflowModule");
    expect(appTs).not.toContain("m5k:");

    const schema = await fs.readFile(
      path.join(result.targetDirectory, "apps/server/src/schema.ts"),
      "utf8"
    );
    expect(schema).toContain('from "@m5kdev/backend/modules/notification/notification.db"');
    expect(schema).toContain("notificationDevices");
    expect(schema).toContain("notificationSendLogs");
    expect(schema).not.toContain("m5k:");

    const serverAgents = await fs.readFile(
      path.join(result.targetDirectory, "apps/server/AGENTS.md"),
      "utf8"
    );
    expect(serverAgents).toContain("NotificationModule");

    const source = await fs.readFile(path.join(result.targetDirectory, ".m5kdev.json"), "utf8");
    const state = JSON.parse(source) as { template: { features: string[] } };
    expect(state.template.features).toEqual(["notifications", "webapp", "workflows"]);
  });

  it("keeps the Workflow Playwright spec only when Workflows and the test harness are both on", async () => {
    const withBoth = await scaffoldProject({
      targetDirectory: "workflow-harness-desk",
      appName: "Workflow Harness Desk",
      appDescription: "Workflows plus test harness fixture.",
      yes: true,
      testHarness: true,
      modules: ["workflows"],
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    await expect(
      fs.stat(path.join(withBoth.targetDirectory, "apps/e2e/tests/workflow.spec.ts"))
    ).resolves.toBeTruthy();
    const withBothConfig = await fs.readFile(
      path.join(withBoth.targetDirectory, "apps/e2e/playwright.config.ts"),
      "utf8"
    );
    expect(withBothConfig).toContain("workflow.spec.ts");
    expect(withBothConfig).not.toContain("m5k:");

    const harnessOnly = await scaffoldProject({
      targetDirectory: "harness-no-workflow-desk",
      appName: "Harness No Workflow Desk",
      appDescription: "Test harness without Workflows fixture.",
      yes: true,
      testHarness: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    await expect(
      fs.stat(path.join(harnessOnly.targetDirectory, "apps/e2e/tests/workflow.spec.ts"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    const harnessOnlyConfig = await fs.readFile(
      path.join(harnessOnly.targetDirectory, "apps/e2e/playwright.config.ts"),
      "utf8"
    );
    expect(harnessOnlyConfig).not.toContain("workflow.spec.ts");
    expect(harnessOnlyConfig).not.toContain("m5k:");
  });

  it("keeps the Files Playwright spec only when Files and the test harness are both on", async () => {
    const withBoth = await scaffoldProject({
      targetDirectory: "files-harness-desk",
      appName: "Files Harness Desk",
      appDescription: "Files plus test harness fixture.",
      yes: true,
      testHarness: true,
      modules: ["files"],
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    await expect(
      fs.stat(path.join(withBoth.targetDirectory, "apps/e2e/tests/files.spec.ts"))
    ).resolves.toBeTruthy();
    const withBothConfig = await fs.readFile(
      path.join(withBoth.targetDirectory, "apps/e2e/playwright.config.ts"),
      "utf8"
    );
    expect(withBothConfig).toContain("files.spec.ts");
    expect(withBothConfig).not.toContain("m5k:");

    const harnessOnly = await scaffoldProject({
      targetDirectory: "harness-no-files-desk",
      appName: "Harness No Files Desk",
      appDescription: "Test harness without Files fixture.",
      yes: true,
      testHarness: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    await expect(
      fs.stat(path.join(harnessOnly.targetDirectory, "apps/e2e/tests/files.spec.ts"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    const harnessOnlyConfig = await fs.readFile(
      path.join(harnessOnly.targetDirectory, "apps/e2e/playwright.config.ts"),
      "utf8"
    );
    expect(harnessOnlyConfig).not.toContain("files.spec.ts");
    expect(harnessOnlyConfig).not.toContain("m5k:");
  });

  it.each([
    ["expo", false, ["expo"]],
    ["both", false, ["expo", "webapp"]],
    ["web", true, ["test-harness", "webapp"]],
  ] as const)(
    "persists managed features for %s (test harness: %s)",
    async (platform, testHarness, features) => {
      const result = await scaffoldProject({
        targetDirectory: `state-${platform}-${testHarness}`,
        appName: "State Fixture",
        appDescription: "Managed state fixture.",
        platform,
        testHarness,
        yes: true,
        force: false,
        skipInstall: true,
        skipGit: true,
      });
      const source = await fs.readFile(path.join(result.targetDirectory, ".m5kdev.json"), "utf8");
      const state = JSON.parse(source) as {
        template: { features: string[]; context: Record<string, unknown> };
        catalog: Record<string, string>;
      };
      expect(state.template.features).toEqual(features);
      if (new Set<string>(features).has("expo")) {
        expect(state.catalog).toHaveProperty("react-native-web", "^0.21.2");
      } else {
        expect(state.catalog).not.toHaveProperty("react-native-web");
      }
      expect(state.template.context).not.toHaveProperty("betterAuthSecret");
      expect(source).not.toMatch(/betterAuthSecret|BETTER_AUTH_SECRET/);
    }
  );

  it("requires Node >=24 and ships product Deploy home files", async () => {
    const result = await scaffoldProject({
      targetDirectory: "deploy-desk",
      appName: "Deploy Desk",
      appDescription: "Deploy home fixture.",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    const rootPackage = JSON.parse(
      await fs.readFile(path.join(result.targetDirectory, "package.json"), "utf8")
    ) as { engines?: { node?: string }; packageManager?: string; scripts?: Record<string, string> };
    expect(rootPackage.engines?.node).toBe(">=24");
    expect(rootPackage.packageManager).toBe("pnpm@10.13.1");
    expect(rootPackage.scripts?.["app:deploy"]).toContain("apps/shared/fly.toml");
    expect(rootPackage.scripts?.["app:deploy"]).toContain("apps/shared/Dockerfile");
    expect(rootPackage.scripts?.["app:secrets"]).toContain("apps/shared/.env.production");

    const dockerignore = await fs.readFile(
      path.join(result.targetDirectory, ".dockerignore"),
      "utf8"
    );
    expect(dockerignore).toContain("node_modules");
    expect(dockerignore).toContain(".env");
    await expect(
      fs.stat(path.join(result.targetDirectory, "apps/shared/.dockerignore"))
    ).rejects.toMatchObject({ code: "ENOENT" });

    const dockerfile = await fs.readFile(
      path.join(result.targetDirectory, "apps/shared/Dockerfile"),
      "utf8"
    );
    expect(dockerfile).toContain("FROM node:24-slim");
    expect(dockerfile).not.toContain("24.11.0");
    expect(dockerfile).toContain("pnpm@10.13.1");
    expect(dockerfile).toContain("pnpm install --frozen-lockfile --prod=false");
    expect(dockerfile).toContain("required=false");
    expect(dockerfile).toContain("pnpm --filter=@deploy-desk/server build");
    expect(dockerfile).toContain("pnpm --filter=@deploy-desk/webapp build");
    expect(dockerfile).toContain(
      "pnpm --filter=@deploy-desk/server deploy --prod --legacy /deploy"
    );
    expect(dockerfile).toContain("/deploy/client");
    expect(dockerfile).toContain('CMD ["node", "index.js"]');
    expect(dockerfile).not.toContain("m5k:webapp");
    expect(dockerfile).not.toContain("{{");

    const flyToml = await fs.readFile(
      path.join(result.targetDirectory, "apps/shared/fly.toml"),
      "utf8"
    );
    expect(flyToml).toContain('app = "deploy-desk-app"');
    expect(flyToml).toContain('primary_region = "iad"');
    expect(flyToml).toContain('source = "libsql_data"');
    expect(flyToml).toContain('destination = "/app/data"');
    expect(flyToml).toContain('memory = "1gb"');
    expect(flyToml).toContain("internal_port = 8080");
    expect(flyToml).toContain("force_https = true");
    expect(flyToml).toContain("min_machines_running = 1");
    expect(flyToml).not.toContain("{{");

    const envExample = await fs.readFile(
      path.join(result.targetDirectory, "apps/shared/.env.production.example"),
      "utf8"
    );
    expect(envExample).toContain("DATABASE_URL=file:/app/data/local.db");
    expect(envExample).toContain("REDIS_URL");
    expect(envExample).not.toContain("{{");

    const deployWrapper = await fs.readFile(
      path.join(result.targetDirectory, "apps/shared/scripts/fly-deploy.mjs"),
      "utf8"
    );
    expect(deployWrapper).toContain("--build-secret");
    expect(deployWrapper).toMatch(/Copy the \.env\.production\.example/);

    const secretsWrapper = await fs.readFile(
      path.join(result.targetDirectory, "apps/shared/scripts/fly-secrets.mjs"),
      "utf8"
    );
    expect(secretsWrapper).toContain("secrets");
    expect(secretsWrapper).toContain("import");

    const gitignore = await fs.readFile(path.join(result.targetDirectory, ".gitignore"), "utf8");
    expect(gitignore).toMatch(/\.env\.production/);

    const appTs = await fs.readFile(
      path.join(result.targetDirectory, "apps/server/src/app.ts"),
      "utf8"
    );
    expect(appTs).toContain('spa: { root: "./client" }');
  });

  it("always ships Landing and strips webapp image stages for expo-only create", async () => {
    const web = await scaffoldProject({
      targetDirectory: "landing-web",
      appName: "Landing Web",
      appDescription: "Landing fixture.",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });
    const expo = await scaffoldProject({
      targetDirectory: "landing-expo",
      appName: "Landing Expo",
      appDescription: "Expo-only landing fixture.",
      platform: "expo",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    for (const result of [web, expo]) {
      const landingPackage = await fs.readFile(
        path.join(result.targetDirectory, "apps/landing/package.json"),
        "utf8"
      );
      expect(landingPackage).toContain(`"name": "${result.context.packageScope}/landing"`);
      await expect(
        fs.stat(path.join(result.targetDirectory, "apps/landing/.dockerignore"))
      ).rejects.toMatchObject({ code: "ENOENT" });

      const landingFly = await fs.readFile(
        path.join(result.targetDirectory, "apps/landing/fly.toml"),
        "utf8"
      );
      expect(landingFly).toContain(`app = "${result.context.appSlug}-landing"`);
      expect(landingFly).toContain('primary_region = "iad"');
      expect(landingFly).toContain('memory = "1gb"');
      expect(landingFly).not.toContain("[[mounts]]");
      expect(landingFly).not.toContain("{{");

      const landingDocker = await fs.readFile(
        path.join(result.targetDirectory, "apps/landing/Dockerfile"),
        "utf8"
      );
      expect(landingDocker).toContain("FROM node:24-slim");
      expect(landingDocker).not.toContain("24.11.0");
      expect(landingDocker).toContain(`pnpm --filter=${result.context.packageScope}/landing build`);
      expect(landingDocker).toContain("required=false");
      expect(landingDocker).not.toContain("{{");

      const rootPackage = JSON.parse(
        await fs.readFile(path.join(result.targetDirectory, "package.json"), "utf8")
      ) as { engines?: { node?: string }; scripts?: Record<string, string> };
      expect(rootPackage.engines?.node).toBe(">=24");
      expect(rootPackage.scripts?.["landing:deploy"]).toContain(
        "apps/landing/scripts/fly-deploy.mjs"
      );
      expect(rootPackage.scripts?.["landing:secrets"]).toContain("apps/landing/.env.production");

      await expect(
        fs.stat(path.join(result.targetDirectory, "apps/landing/.env.production.example"))
      ).resolves.toBeTruthy();
      await expect(
        fs.stat(path.join(result.targetDirectory, "apps/landing/scripts/fly-deploy.mjs"))
      ).resolves.toBeTruthy();

      const landingPage = await fs.readFile(
        path.join(result.targetDirectory, "apps/landing/src/LandingPage.tsx"),
        "utf8"
      );
      expect(landingPage).toContain("VITE_APP_URL");
      expect(landingPage).toContain('from "@heroui/react"');
    }

    const expoDocker = await fs.readFile(
      path.join(expo.targetDirectory, "apps/shared/Dockerfile"),
      "utf8"
    );
    expect(expoDocker).toContain("pnpm --filter=@landing-expo/server build");
    expect(expoDocker).not.toContain("webapp build");
    expect(expoDocker).not.toContain("/deploy/client");
    await expect(fs.stat(path.join(expo.targetDirectory, "apps/webapp"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    const expoAppTs = await fs.readFile(
      path.join(expo.targetDirectory, "apps/server/src/app.ts"),
      "utf8"
    );
    expect(expoAppTs).toContain('spa: { root: "./client" }');
    expect(expoAppTs).toContain("AuthModule");
    expect(expoAppTs).toContain("PostsModule");
    expect(expoAppTs).not.toContain("WorkflowModule");
    expect(expoAppTs).not.toContain("m5k:");
  });

  it("refuses to overwrite a non-empty directory without force", async () => {
    await fs.mkdir(path.join(tempRoot, "occupied"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, "occupied", "README.md"), "taken", "utf8");

    await expect(
      scaffoldProject({
        targetDirectory: "occupied",
        appName: "Occupied",
        appDescription: "Collision test",
        yes: true,
        force: false,
        skipInstall: true,
        skipGit: true,
      })
    ).rejects.toThrow("Target directory is not empty");
  });

  it("removes a newly created target directory when scaffolding fails", async () => {
    jest
      .spyOn(fsHelpers, "copyTemplateDirectory")
      .mockRejectedValueOnce(new Error("scaffold failed"));

    await expect(
      scaffoldProject({
        targetDirectory: "fresh-fail",
        appName: "Fresh Fail",
        appDescription: "Cleanup test",
        yes: true,
        force: false,
        skipInstall: true,
        skipGit: true,
      })
    ).rejects.toThrow("scaffold failed");

    await expect(fs.stat(path.join(tempRoot, "fresh-fail"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("preserves pre-existing content when a forced scaffold fails", async () => {
    const occupied = path.join(tempRoot, "occupied-force");
    await fs.mkdir(occupied, { recursive: true });
    await fs.writeFile(path.join(occupied, "keep-me.txt"), "precious", "utf8");

    jest
      .spyOn(fsHelpers, "copyTemplateDirectory")
      .mockRejectedValueOnce(new Error("scaffold failed"));

    await expect(
      scaffoldProject({
        targetDirectory: "occupied-force",
        appName: "Occupied Force",
        appDescription: "Force cleanup test",
        yes: true,
        force: true,
        skipInstall: true,
        skipGit: true,
      })
    ).rejects.toThrow("scaffold failed");

    await expect(fs.readFile(path.join(occupied, "keep-me.txt"), "utf8")).resolves.toBe("precious");
  });
});
