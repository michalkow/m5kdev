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

    const emailPackage = await fs.readFile(
      path.join(result.targetDirectory, "apps/email/package.json"),
      "utf8"
    );
    const workspaceYaml = await fs.readFile(
      path.join(result.targetDirectory, "pnpm-workspace.yaml"),
      "utf8"
    );

    expect(emailPackage).not.toMatch(/"@m5kdev\/[^"]+": "workspace:\*"/);
    expect(emailPackage).toContain('"@m5kdev/email": "catalog:"');
    expect(workspaceYaml).toContain('"@m5kdev/email":');

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
