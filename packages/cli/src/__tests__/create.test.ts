import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { scaffoldProject } from "../create";
import { diagnoseManagedRepo } from "../doctor";
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

  it.each(["web", "expo", "both", "landing"] as const)(
    "ships coherent AGENTS guidance using global skills for %s apps",
    async (platform) => {
      const { targetDirectory } = await scaffoldProject({
        targetDirectory: "guided-app",
        appName: "Guided App",
        appDescription: "An app with a North Star.",
        platform,
        modules: platform === "landing" ? [] : ["workflows"],
        force: false,
        yes: true,
        skipInstall: true,
        skipGit: true,
      });
      const read = (file: string) => fs.readFile(path.join(targetDirectory, file), "utf8");
      await expect(fs.stat(path.join(targetDirectory, "CLAUDE.md"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(fs.stat(path.join(targetDirectory, ".cursor"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      // The scaffold points at the developer's purpose document without inventing one.
      await expect(fs.stat(path.join(targetDirectory, "PROJECT.md"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      const agents = await read("AGENTS.md");
      expect(agents).toContain("PROJECT.md");
      expect(agents).toContain("North Star");
      expect(agents).toContain("before making changes");
      expect(agents).toContain("If it is absent, continue");
      expect(agents).toContain("https://github.com/michalkow/skills");
      expect(agents).toMatch(/globally\s+installed/);
      expect(agents).toContain("https://github.com/michalkow/m5kdev");
      expect(agents).toContain("/Users/michalkow/Projects/m5kdev");
      expect(agents).toContain("installed version");
      expect(agents).toContain("upstream PR");
      expect(agents).toMatch(/explicit user\s+instruction/);
      expect(agents).toContain("Production");
      expect(agents).toContain("docs/agents/issue-tracker.md");
      expect(agents).toContain("docs/agents/triage-labels.md");
      expect(agents).toContain("docs/agents/domain.md");
      expect(agents).not.toContain(".cursor/");
      expect(agents).not.toContain("CLAUDE.md");
      expect(agents).not.toContain("m5k:");
      if (platform !== "landing") {
        expect(agents).toContain("rule-module-service");
        expect(agents).toContain("rule-module-prompt");
        expect(agents).toContain("rule-server-event-emit");
        expect(agents).toContain("without asking for confirmation");
        expect(agents).toContain("BasePermissionService");
        expect(agents).toContain("handleTRPCResult");
        const migrations = await read("docs/agents/database-migrations.md");
        expect(migrations).toContain("Never hand-write or edit migration SQL");
        expect(migrations).toContain("explicit user instruction");
        expect(migrations).toContain("Migrations already merged to `main` are frozen");
        expect(migrations).not.toContain("globs:");
        for (const file of [
          "apps/server/AGENTS.md",
          "docs/agents/environments.md",
          "docs/deployment.md",
        ]) {
          expect(await read(file)).not.toContain(".cursor/");
        }
      } else {
        expect(agents).not.toContain("rule-module-service");
        expect(agents).not.toContain("apps/server");
        await expect(read("docs/agents/database-migrations.md")).rejects.toMatchObject({
          code: "ENOENT",
        });
      }
      if (platform === "web" || platform === "both") {
        expect(agents).toContain("rule-frontend-component");
        expect(agents).toContain("HeroUI v3");
        expect(await read("apps/webapp/AGENTS.md")).not.toContain(".cursor/");
      } else {
        expect(agents).not.toContain("rule-frontend-component");
      }
    }
  );

  it.each(["web", "expo", "both", "landing"] as const)(
    "includes usable local Changesets tooling for %s apps",
    async (platform) => {
      const { targetDirectory } = await scaffoldProject({
        targetDirectory: "versioned-app",
        appName: "Versioned App",
        appDescription: "An app with release notes.",
        platform,
        force: false,
        yes: true,
        skipInstall: true,
        skipGit: true,
      });
      const rootPackage = JSON.parse(
        await fs.readFile(path.join(targetDirectory, "package.json"), "utf8")
      );
      const workspace = parse(
        await fs.readFile(path.join(targetDirectory, "pnpm-workspace.yaml"), "utf8")
      );
      expect(rootPackage.devDependencies["@changesets/cli"]).toBe("catalog:m5kdev");
      expect(rootPackage.dependencies?.["@changesets/cli"]).toBeUndefined();
      expect(workspace.catalogs.m5kdev["@changesets/cli"]).toBe("2.30.0");
      expect(rootPackage.scripts["cs:add"]).toBe("changeset add");
      expect(rootPackage.scripts["cs:version"]).toBe("changeset version");
      const config = JSON.parse(
        await fs.readFile(path.join(targetDirectory, ".changeset/config.json"), "utf8")
      );
      expect(config).toMatchObject({
        baseBranch: "main",
        commit: false,
        privatePackages: { version: true, tag: false },
        fixed: [],
        linked: [],
        ignore: [],
      });
      const readme = await fs.readFile(path.join(targetDirectory, "README.md"), "utf8");
      expect(readme).toContain("pnpm cs:add");
      expect(readme).toContain("pnpm cs:version");
      await expect(
        fs.readFile(path.join(targetDirectory, ".changeset/README.md"), "utf8")
      ).resolves.toContain("pnpm cs:add");

      // Reuse the installed external CLI so this integration test needs no registry access.
      await fs.symlink(
        path.resolve(__dirname, "../../../../node_modules"),
        path.join(targetDirectory, "node_modules")
      );
      const add = spawnSync("pnpm", ["cs:add", "--empty"], {
        cwd: targetDirectory,
        encoding: "utf8",
      });
      expect({ status: add.status, stderr: add.stderr }).toEqual({ status: 0, stderr: "" });
      await fs.writeFile(
        path.join(targetDirectory, ".changeset/landing-patch.md"),
        '---\n"@versioned-app/landing": patch\n---\n\nImprove the landing page.\n'
      );
      const version = spawnSync("pnpm", ["cs:version"], {
        cwd: targetDirectory,
        encoding: "utf8",
      });
      expect({ status: version.status, stderr: version.stderr }).toEqual({ status: 0, stderr: "" });
      const landing = JSON.parse(
        await fs.readFile(path.join(targetDirectory, "apps/landing/package.json"), "utf8")
      );
      expect(landing).toMatchObject({ version: "0.0.1", private: true });
      await expect(
        fs.readFile(path.join(targetDirectory, "apps/landing/CHANGELOG.md"), "utf8")
      ).resolves.toContain("Improve the landing page.");
      await expect(
        fs.stat(path.join(targetDirectory, ".changeset/landing-patch.md"))
      ).rejects.toMatchObject({ code: "ENOENT" });
    }
  );

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
    await expect(fs.stat(path.join(result.targetDirectory, "CLAUDE.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.stat(path.join(result.targetDirectory, ".cursor"))).rejects.toMatchObject({
      code: "ENOENT",
    });
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
    // Global providers are composed in Providers.tsx.
    const providers = await fs.readFile(
      path.join(result.targetDirectory, "apps/webapp/src/Providers.tsx"),
      "utf8"
    );
    const appTs = await fs.readFile(
      path.join(result.targetDirectory, "apps/server/src/app.ts"),
      "utf8"
    );

    expect(rootPackage).toContain('"name": "editorial-desk"');
    expect(rootAgents).toContain("Editorial Desk");
    expect(rootAgents).toContain("A clean newsroom starter.");
    expect(rootAgents).toContain("apps/shared/src/modules/posts/");
    expect(rootAgents).toContain("apps/server/src/modules/posts/");
    expect(rootAgents).toContain("apps/webapp/src/modules/posts/");
    expect(rootAgents).toContain("rule-module-db");
    expect(rootAgents).toContain("## Agent skills");
    expect(rootAgents).toContain("docs/agents/issue-tracker.md");
    expect(rootAgents).toContain("docs/agents/triage-labels.md");
    expect(rootAgents).toContain("docs/agents/domain.md");
    expect(rootAgents).not.toMatch(/## Cloud/i);
    expect(rootAgents).not.toContain("Server event:");

    const glossary = await fs.readFile(path.join(result.targetDirectory, "GLOSSARY.md"), "utf8");
    expect(glossary).toContain("# Editorial Desk");
    expect(glossary).toContain("A clean newsroom starter.");
    expect(glossary).toContain("**Organization**:");
    expect(glossary).toContain("**Membership**:");
    expect(glossary).toContain("**Admin panel**:");
    expect(glossary).not.toContain("**File**:");
    expect(glossary).not.toContain("**Post**:");
    expect(glossary).not.toContain("{{APP_NAME}}");
    expect(glossary).not.toContain("m5k:");

    await expect(
      fs.stat(path.join(result.targetDirectory, "docs/agents/issue-tracker.md"))
    ).resolves.toBeTruthy();
    await expect(
      fs.stat(path.join(result.targetDirectory, "docs/agents/domain.md"))
    ).resolves.toBeTruthy();
    await expect(
      fs.stat(path.join(result.targetDirectory, "docs/agents/triage-labels.md"))
    ).resolves.toBeTruthy();
    await expect(
      fs.stat(path.join(result.targetDirectory, "docs/adr/.gitkeep"))
    ).resolves.toBeTruthy();

    // Disabled platform/harness sections are stripped from the common instruction file.
    expect(rootAgents).not.toContain("apps/expo");
    expect(rootAgents).not.toContain("apps/e2e");
    expect(rootAgents).not.toContain("m5k:");
    expect(sharedEnv).toContain("VITE_APP_NAME=Editorial Desk");
    expect(sharedEnv).not.toContain("{{APP_NAME}}");
    expect(appConstants).toContain('APP_NAME = "Editorial Desk"');
    expect(appConstants).toContain('APP_SLUG = "editorial-desk"');
    expect(providers).toContain("AppConfigProvider");
    expect(providers).toContain("AppTrpcQueryProvider");
    expect(providers).toContain("StarterServerEventProvider");
    expect(providers).not.toContain("DEMO_WORKFLOW");
    expect(providers).not.toContain("createWorkflowListServerEventHandler");
    const serverEventShell = await fs.readFile(
      path.join(result.targetDirectory, "apps/webapp/src/StarterServerEventProvider.tsx"),
      "utf8"
    );
    expect(serverEventShell).toContain("ServerEventProvider");
    expect(serverEventShell).not.toContain("DEMO_WORKFLOW");
    expect(serverEventShell).not.toContain("m5k:");
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
    expect(managedState.template.features).toEqual(["docs-landing", "webapp"]);
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
    expect(appTs).not.toContain("AIModule");
    expect(appTs).not.toContain("McpModule");
    expect(appTs).not.toContain("redis:");
    expect(appTs).not.toContain("m5k:");

    const schema = await fs.readFile(
      path.join(result.targetDirectory, "apps/server/src/schema.ts"),
      "utf8"
    );
    expect(schema).not.toContain('from "@m5kdev/backend/modules/workflow/workflow.db"');
    expect(schema).not.toContain('from "@m5kdev/backend/modules/notification/notification.db"');
    expect(schema).not.toContain('from "@m5kdev/backend/modules/ai/ai.db"');
    expect(schema).not.toContain('from "@m5kdev/backend/modules/mcp/mcp.db"');
    expect(schema).not.toContain("mcpAllowlistEntries");
    expect(schema).not.toContain("auth.oauth.db");
    expect(schema).not.toContain("m5k:");

    const serverPackage = await fs.readFile(
      path.join(result.targetDirectory, "apps/server/package.json"),
      "utf8"
    );
    expect(serverPackage).not.toContain("@m5kdev/module-");
    expect(appTs).not.toContain("PdfModule");
    expect(appTs).not.toContain("DocxModule");
    expect(appTs).not.toContain("VideoModule");
    expect(appTs).not.toContain("SocialModule");
    expect(appTs).not.toContain("ClayModule");

    const serverAgents = await fs.readFile(
      path.join(result.targetDirectory, "apps/server/AGENTS.md"),
      "utf8"
    );
    expect(serverAgents).not.toContain("NotificationModule");
    expect(serverAgents).not.toContain("McpModule");

    const router = await fs.readFile(
      path.join(result.targetDirectory, "apps/webapp/src/Router.tsx"),
      "utf8"
    );
    expect(router).not.toContain("WorkflowsRoute");
    expect(router).not.toContain('path="workflows"');
    expect(router).not.toContain("ConversationRoute");
    expect(router).not.toContain('path="conversation"');

    await expect(
      fs.stat(
        path.join(result.targetDirectory, "apps/webapp/src/modules/workflows/WorkflowsRoute.tsx")
      )
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.stat(
        path.join(
          result.targetDirectory,
          "apps/webapp/src/modules/conversation/ConversationRoute.tsx"
        )
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
    expect(state.template.features).toEqual(["docs-landing", "webapp"]);
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

    const offApp = await fs.readFile(
      path.join(off.targetDirectory, "apps/server/src/app.ts"),
      "utf8"
    );
    expect(offApp).not.toContain("FileModule");
    expect(offApp).not.toContain("m5k:");

    const offGlossary = await fs.readFile(path.join(off.targetDirectory, "GLOSSARY.md"), "utf8");
    expect(offGlossary).toContain("**Organization**:");
    expect(offGlossary).not.toContain("**File**:");
    expect(offGlossary).not.toContain("m5k:");

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

    const onApp = await fs.readFile(
      path.join(on.targetDirectory, "apps/server/src/app.ts"),
      "utf8"
    );
    expect(onApp).toContain("FileModule");
    expect(onApp).not.toContain("m5k:");

    const onGlossary = await fs.readFile(path.join(on.targetDirectory, "GLOSSARY.md"), "utf8");
    expect(onGlossary).toContain("**File**:");
    expect(onGlossary).not.toContain("**Subscription**:");
    expect(onGlossary).not.toContain("m5k:");

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
    expect(state.template.features).toEqual(["docs-landing", "files", "webapp"]);
  });

  it("omits McpModule unless that Backend Module is selected", async () => {
    const off = await scaffoldProject({
      targetDirectory: "mcp-off-desk",
      appName: "Mcp Off Desk",
      appDescription: "McpModule omitted fixture.",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    const offApp = await fs.readFile(
      path.join(off.targetDirectory, "apps/server/src/app.ts"),
      "utf8"
    );
    expect(offApp).not.toContain("McpModule");
    expect(offApp).not.toContain("m5k:");

    const offSchema = await fs.readFile(
      path.join(off.targetDirectory, "apps/server/src/schema.ts"),
      "utf8"
    );
    expect(offSchema).not.toContain('from "@m5kdev/backend/modules/mcp/mcp.db"');
    expect(offSchema).not.toContain("mcpAllowlistEntries");
    expect(offSchema).not.toContain("auth.oauth.db");

    await expect(
      fs.stat(path.join(off.targetDirectory, "apps/server/src/modules/posts/posts.mcp.ts"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    const offPostsModule = await fs.readFile(
      path.join(off.targetDirectory, "apps/server/src/modules/posts/posts.module.ts"),
      "utf8"
    );
    expect(offPostsModule).not.toContain("createPostsMcp");
    expect(offPostsModule).not.toContain("override mcp(");
    expect(offPostsModule).not.toContain("m5k:");
    const offPostsTrpc = await fs.readFile(
      path.join(off.targetDirectory, "apps/server/src/modules/posts/posts.trpc.ts"),
      "utf8"
    );
    expect(offPostsTrpc).not.toContain("mcp:");
    expect(offPostsTrpc).not.toContain('"list-posts"');
    expect(offPostsTrpc).not.toContain('"create-post"');
    expect(offPostsTrpc).not.toContain("m5k:");

    const on = await scaffoldProject({
      targetDirectory: "mcp-on-desk",
      appName: "Mcp On Desk",
      appDescription: "McpModule fixture.",
      yes: true,
      modules: ["mcp"],
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    const onApp = await fs.readFile(
      path.join(on.targetDirectory, "apps/server/src/app.ts"),
      "utf8"
    );
    expect(onApp).toContain("McpModule");
    expect(onApp).toContain("new McpModule(");
    expect(onApp).not.toContain("m5k:");

    const onSchema = await fs.readFile(
      path.join(on.targetDirectory, "apps/server/src/schema.ts"),
      "utf8"
    );
    expect(onSchema).toContain("mcpAllowlistEntries");
    expect(onSchema).toContain("oauthClients");
    expect(onSchema).toContain("auth.oauth.db");
    expect(onSchema).not.toContain("m5k:");

    const postsSource = await fs.readFile(
      path.join(on.targetDirectory, "apps/server/src/modules/posts/posts.service.ts"),
      "utf8"
    );
    expect(postsSource).not.toContain("mcpCall");
    expect(postsSource).not.toMatch(/\.mcp\./);
    expect(postsSource).toContain("ctx.actor.organizationId");
    expect(postsSource).not.toContain("session.activeOrganizationId");

    const onPostsModule = await fs.readFile(
      path.join(on.targetDirectory, "apps/server/src/modules/posts/posts.module.ts"),
      "utf8"
    );
    expect(onPostsModule).not.toContain("createPostsMcp");
    expect(onPostsModule).not.toContain("override mcp(");
    expect(onPostsModule).not.toContain("m5k:");

    await expect(
      fs.stat(path.join(on.targetDirectory, "apps/server/src/modules/posts/posts.mcp.ts"))
    ).rejects.toMatchObject({ code: "ENOENT" });

    const onPostsTrpc = await fs.readFile(
      path.join(on.targetDirectory, "apps/server/src/modules/posts/posts.trpc.ts"),
      "utf8"
    );
    expect(onPostsTrpc).toContain(".meta({");
    expect(onPostsTrpc).toContain("mcp: {");
    expect(onPostsTrpc).toContain('"list-posts"');
    expect(onPostsTrpc).toContain('"create-post"');
    expect(onPostsTrpc).toContain("Call list-organizations first");
    expect(onPostsTrpc).not.toContain("defineMcpCall");
    expect(onPostsTrpc).not.toContain("m5k:");

    const onAgents = await fs.readFile(
      path.join(on.targetDirectory, "apps/server/AGENTS.md"),
      "utf8"
    );
    expect(onAgents).toContain("McpModule");

    const source = await fs.readFile(path.join(on.targetDirectory, ".m5kdev.json"), "utf8");
    const state = JSON.parse(source) as { template: { features: string[] } };
    expect(state.template.features).toEqual(["docs-landing", "mcp", "webapp"]);
  });

  it("omits AI unless that Backend Module is selected", async () => {
    const off = await scaffoldProject({
      targetDirectory: "ai-off-desk",
      appName: "AI Off Desk",
      appDescription: "AI module omitted fixture.",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    const offApp = await fs.readFile(
      path.join(off.targetDirectory, "apps/server/src/app.ts"),
      "utf8"
    );
    expect(offApp).not.toContain("AIModule");
    expect(offApp).not.toContain("conversation.mastra");
    expect(offApp).not.toContain("m5k:");

    const offSchema = await fs.readFile(
      path.join(off.targetDirectory, "apps/server/src/schema.ts"),
      "utf8"
    );
    expect(offSchema).not.toContain('from "@m5kdev/backend/modules/ai/ai.db"');
    expect(offSchema).not.toContain("aiUsage");

    const offRouter = await fs.readFile(
      path.join(off.targetDirectory, "apps/webapp/src/Router.tsx"),
      "utf8"
    );
    expect(offRouter).not.toContain("ConversationRoute");
    expect(offRouter).not.toContain('path="conversation"');

    await expect(
      fs.stat(
        path.join(off.targetDirectory, "apps/webapp/src/modules/conversation/ConversationRoute.tsx")
      )
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.stat(
        path.join(
          off.targetDirectory,
          "apps/server/src/modules/conversation/conversation.mastra.ts"
        )
      )
    ).rejects.toMatchObject({ code: "ENOENT" });

    const offEnv = await fs.readFile(
      path.join(off.targetDirectory, "apps/shared/.env.example"),
      "utf8"
    );
    expect(offEnv).not.toContain("OPENROUTER_API_KEY");
    expect(offEnv).not.toContain("m5k:");

    const on = await scaffoldProject({
      targetDirectory: "ai-on-desk",
      appName: "AI On Desk",
      appDescription: "AI module fixture.",
      yes: true,
      modules: ["ai"],
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    const onApp = await fs.readFile(
      path.join(on.targetDirectory, "apps/server/src/app.ts"),
      "utf8"
    );
    expect(onApp).toContain("AIModule");
    expect(onApp).toContain("conversation.mastra");
    expect(onApp).not.toContain("m5k:");

    const onSchema = await fs.readFile(
      path.join(on.targetDirectory, "apps/server/src/schema.ts"),
      "utf8"
    );
    expect(onSchema).toContain("aiUsage");
    expect(onSchema).toContain("chats");
    expect(onSchema).not.toContain("m5k:");

    const onRouter = await fs.readFile(
      path.join(on.targetDirectory, "apps/webapp/src/Router.tsx"),
      "utf8"
    );
    expect(onRouter).toContain("ConversationRoute");
    expect(onRouter).toContain('path="conversation"');

    await expect(
      fs.stat(
        path.join(on.targetDirectory, "apps/webapp/src/modules/conversation/ConversationRoute.tsx")
      )
    ).resolves.toBeTruthy();
    await expect(
      fs.stat(
        path.join(on.targetDirectory, "apps/server/src/modules/conversation/conversation.mastra.ts")
      )
    ).resolves.toBeTruthy();

    const onEnv = await fs.readFile(
      path.join(on.targetDirectory, "apps/shared/.env.example"),
      "utf8"
    );
    expect(onEnv).toContain("OPENROUTER_API_KEY=");
    expect(onEnv).not.toContain("m5k:");

    const source = await fs.readFile(path.join(on.targetDirectory, ".m5kdev.json"), "utf8");
    const state = JSON.parse(source) as { template: { features: string[] } };
    expect(state.template.features).toEqual(["ai", "docs-landing", "webapp"]);
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
    expect(appTs).toContain('defaultQueue: "workflow-desk-main"');
    expect(appTs).toContain('"workflow-desk-main": { concurrency: 5 }');
    // The Kernel turns schedulers off where the environment shares another's
    // database (Canary); the app does not set it by hand.
    expect(appTs).not.toContain("schedulers:");
    expect(appTs).toContain("redis:");
    expect(appTs).not.toContain("m5k:");

    const demoWorkflow = await fs.readFile(
      path.join(
        result.targetDirectory,
        "apps/server/src/modules/demo-workflow/demo-workflow.service.ts"
      ),
      "utf8"
    );
    expect(demoWorkflow).toContain('queue: "workflow-desk-main"');

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

    const webappApp = await fs.readFile(
      path.join(result.targetDirectory, "apps/webapp/src/Providers.tsx"),
      "utf8"
    );
    const serverEventProvider = await fs.readFile(
      path.join(result.targetDirectory, "apps/webapp/src/StarterServerEventProvider.tsx"),
      "utf8"
    );
    expect(webappApp).toContain("StarterServerEventProvider");
    expect(serverEventProvider).toContain("DEMO_WORKFLOW_SERVER_EVENT_RESOURCE");
    expect(serverEventProvider).toContain("trpc.workflow.list");
    expect(serverEventProvider).not.toContain("m5k:");

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
    expect(state.template.features).toEqual(["docs-landing", "webapp", "workflows"]);
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
    expect(schema).toContain("notifications");
    expect(schema).toContain("notificationPreferences");
    expect(schema).not.toContain("m5k:");

    const serverAgents = await fs.readFile(
      path.join(result.targetDirectory, "apps/server/AGENTS.md"),
      "utf8"
    );
    expect(serverAgents).toContain("NotificationModule");

    const source = await fs.readFile(path.join(result.targetDirectory, ".m5kdev.json"), "utf8");
    const state = JSON.parse(source) as { template: { features: string[] } };
    expect(state.template.features).toEqual([
      "docs-landing",
      "notifications",
      "webapp",
      "workflows",
    ]);
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

  it("keeps the Conversation Playwright spec only when AI and the test harness are both on", async () => {
    const withBoth = await scaffoldProject({
      targetDirectory: "ai-harness-desk",
      appName: "AI Harness Desk",
      appDescription: "AI plus test harness fixture.",
      yes: true,
      testHarness: true,
      modules: ["ai"],
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    await expect(
      fs.stat(path.join(withBoth.targetDirectory, "apps/e2e/tests/conversation.spec.ts"))
    ).resolves.toBeTruthy();
    const withBothConfig = await fs.readFile(
      path.join(withBoth.targetDirectory, "apps/e2e/playwright.config.ts"),
      "utf8"
    );
    expect(withBothConfig).toContain("conversation.spec.ts");
    expect(withBothConfig).not.toContain("m5k:");

    const harnessOnly = await scaffoldProject({
      targetDirectory: "harness-no-ai-desk",
      appName: "Harness No AI Desk",
      appDescription: "Test harness without AI fixture.",
      yes: true,
      testHarness: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    await expect(
      fs.stat(path.join(harnessOnly.targetDirectory, "apps/e2e/tests/conversation.spec.ts"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    const harnessOnlyConfig = await fs.readFile(
      path.join(harnessOnly.targetDirectory, "apps/e2e/playwright.config.ts"),
      "utf8"
    );
    expect(harnessOnlyConfig).not.toContain("conversation.spec.ts");
    expect(harnessOnlyConfig).not.toContain("m5k:");
  });

  it("keeps the MCP Playwright spec only when MCP and the test harness are both on", async () => {
    const withBoth = await scaffoldProject({
      targetDirectory: "mcp-harness-desk",
      appName: "MCP Harness Desk",
      appDescription: "MCP plus test harness fixture.",
      yes: true,
      testHarness: true,
      modules: ["mcp"],
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    await expect(
      fs.stat(path.join(withBoth.targetDirectory, "apps/e2e/tests/mcp.spec.ts"))
    ).resolves.toBeTruthy();
    await expect(
      fs.stat(path.join(withBoth.targetDirectory, "apps/e2e/tests/mcp-helpers.ts"))
    ).resolves.toBeTruthy();
    const withBothConfig = await fs.readFile(
      path.join(withBoth.targetDirectory, "apps/e2e/playwright.config.ts"),
      "utf8"
    );
    expect(withBothConfig).toContain("mcp.spec.ts");
    expect(withBothConfig).not.toContain("m5k:");

    const harnessOnly = await scaffoldProject({
      targetDirectory: "harness-no-mcp-desk",
      appName: "Harness No MCP Desk",
      appDescription: "Test harness without MCP fixture.",
      yes: true,
      testHarness: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    await expect(
      fs.stat(path.join(harnessOnly.targetDirectory, "apps/e2e/tests/mcp.spec.ts"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.stat(path.join(harnessOnly.targetDirectory, "apps/e2e/tests/mcp-helpers.ts"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    const harnessOnlyConfig = await fs.readFile(
      path.join(harnessOnly.targetDirectory, "apps/e2e/playwright.config.ts"),
      "utf8"
    );
    expect(harnessOnlyConfig).not.toContain("mcp.spec.ts");
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
      expect(state.template.features).toEqual(["docs-landing", ...features].sort());
      if (new Set<string>(features).has("expo")) {
        expect(state.catalog).toHaveProperty("react-native-web", "^0.21.2");
      } else {
        expect(state.catalog).not.toHaveProperty("react-native-web");
      }
      expect(state.template.context).not.toHaveProperty("betterAuthSecret");
      expect(source).not.toMatch(/betterAuthSecret|BETTER_AUTH_SECRET/);
    }
  );

  it("ships global module skill pointers and one agent migration policy", async () => {
    const result = await scaffoldProject({
      targetDirectory: "migration-policy",
      appName: "Migration Policy",
      appDescription: "Agent migration policy fixture.",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });
    const read = (relative: string) =>
      fs.readFile(path.join(result.targetDirectory, relative), "utf8");

    const migrations = await read("docs/agents/database-migrations.md");
    expect(migrations).toContain("drizzle:generate");
    expect(migrations).toContain("--custom");
    expect(migrations).toContain("migration-contract");
    expect(migrations).toMatch(/currently in Production/);
    expect(migrations).toMatch(/never regenerate/i);

    const agents = await read("AGENTS.md");
    expect(agents).toContain("rule-module-db");
    expect(agents).toContain("rule-module-repository");
    expect(agents).toContain("docs/agents/database-migrations.md");
    expect(agents).not.toMatch(/must not generate/i);
    expect(agents).toContain("drizzle:generate");
    expect(agents).toMatch(/never hand-write or edit migration SQL/i);
  });

  it("ships deployment environment vocabulary in the glossary", async () => {
    const result = await scaffoldProject({
      targetDirectory: "environment-glossary",
      appName: "Environment Glossary",
      appDescription: "Glossary fixture.",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });
    const glossary = await fs.readFile(path.join(result.targetDirectory, "GLOSSARY.md"), "utf8");
    expect(glossary).toContain("**Deployment environment**:");
    expect(glossary).toContain("**Promotion PR**:");
    expect(glossary).toContain("**Environment namespace**:");
    expect(glossary).not.toContain("m5k:");
  });

  it.each([
    ["3D Studio", "3d-studio"],
    ["X", "x"],
  ])("writes an APP_SLUG the Kernel accepts for %s", async (appName, slug) => {
    const result = await scaffoldProject({
      targetDirectory: slug,
      appName,
      appDescription: "Slug fixture.",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });
    const localEnv = await fs.readFile(
      path.join(result.targetDirectory, "apps/shared/.env"),
      "utf8"
    );
    const appSlug = localEnv.match(/^APP_SLUG=(.*)$/m)?.[1];
    expect(appSlug).toBe(slug);
    // Same pattern as APP_SLUG_PATTERN in packages/backend/src/base/environment.ts,
    // which `createBackendApp` enforces at boot. The CLI cannot import the Kernel.
    expect(appSlug).toMatch(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
  });

  it("configures the Deployment environment and fails closed outside local", async () => {
    const result = await scaffoldProject({
      targetDirectory: "environment-config",
      appName: "Environment Config",
      appDescription: "Environment fixture.",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });
    const read = (relative: string) =>
      fs.readFile(path.join(result.targetDirectory, relative), "utf8");

    const localEnv = await read("apps/shared/.env");
    expect(localEnv).toMatch(/^APP_ENV=local$/m);
    expect(localEnv).toMatch(/^APP_SLUG=environment-config$/m);
    const example = await read("apps/shared/.env.example");
    expect(example).toMatch(/^APP_ENV=local$/m);
    expect(example).toMatch(/^APP_SLUG=environment-config$/m);
    const productionExample = await read("apps/shared/.env.production.example");
    expect(productionExample).toMatch(/^APP_ENV=production$/m);
    expect(productionExample).toMatch(/^APP_SLUG=environment-config$/m);

    const serverPackage = JSON.parse(await read("apps/server/package.json")) as {
      scripts: Record<string, string>;
    };
    expect(serverPackage.scripts["drizzle:rebuild"]).toBe(
      "tsx --env-file=../shared/.env db.ts rebuild"
    );
    expect(await read("AGENTS.md")).toContain("drizzle:rebuild");

    const appTs = await read("apps/server/src/app.ts");
    expect(appTs).toContain("requireEnvValue");
    expect(appTs).not.toContain("process.env.BETTER_AUTH_SECRET ??");
    expect(appTs).not.toContain("NODE_ENV");
  });

  it("checks migrations in CI without secrets", async () => {
    const scaffold = (targetDirectory: string, platform?: "landing") =>
      scaffoldProject({
        targetDirectory,
        appName: "Migration Checks",
        appDescription: "CI fixture.",
        ...(platform ? { platform } : {}),
        yes: true,
        force: false,
        skipInstall: true,
        skipGit: true,
      });
    const web = await scaffold("migration-checks");
    const workflowSource = await fs.readFile(
      path.join(web.targetDirectory, ".github/workflows/check.yml"),
      "utf8"
    );
    expect(workflowSource).not.toContain("secrets.");
    expect(workflowSource).not.toContain("m5k:");
    const workflow = parse(workflowSource) as {
      jobs: { check: { steps: { run?: string; with?: Record<string, unknown> }[] } };
    };
    const steps = workflow.jobs.check.steps;
    const runs = steps.map((step) => step.run ?? "").join("\n");
    expect(steps.find((step) => step.with?.["fetch-depth"] === 0)).toBeTruthy();
    expect(runs).toContain("pnpm test");
    expect(runs).toContain("drizzle-kit check");
    expect(runs).toContain("drizzle:generate");
    expect(runs).toContain("m5kdev-migration-check --folder apps/server/drizzle-postgresql");

    const rootPackage = JSON.parse(
      await fs.readFile(path.join(web.targetDirectory, "package.json"), "utf8")
    ) as { scripts: Record<string, string> };
    expect(rootPackage.scripts.test).toBe("turbo run test");

    const landing = await scaffold("migration-checks-landing", "landing");
    const landingWorkflow = await fs.readFile(
      path.join(landing.targetDirectory, ".github/workflows/check.yml"),
      "utf8"
    );
    expect(landingWorkflow).not.toContain("drizzle");
    expect(landingWorkflow).not.toContain("m5k:");
  });

  it("deploys Development from main and Production from production after migrating", async () => {
    const result = await scaffoldProject({
      targetDirectory: "branch-deploys",
      appName: "Branch Deploys",
      appDescription: "Deployment environment fixture.",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });
    const read = (relative: string) =>
      fs.readFile(path.join(result.targetDirectory, relative), "utf8");

    for (const environment of ["development", "production"]) {
      const fly = await read(`apps/shared/fly.${environment}.toml`);
      expect(fly).toContain(`app = "branch-deploys-${environment}"`);
      expect(fly).toContain('path = "/healthz"');
      expect(fly).not.toContain("release_command");
      expect(fly).not.toContain("{{");
      const example = await read(`apps/shared/.env.${environment}.example`);
      expect(example).toMatch(new RegExp(`^APP_ENV=${environment}$`, "m"));
      expect(example).toContain("DATABASE_DIRECT_URL=");
    }
    expect(await read("apps/shared/Dockerfile")).not.toMatch(/migrate/i);

    const source = await read(".github/workflows/deploy-app.yml");
    expect(source).not.toContain("m5k:");
    const workflow = parse(source) as {
      on: { push: { branches: string[] } };
      concurrency: { group: string; "cancel-in-progress": boolean };
      jobs: Record<
        string,
        {
          needs?: string | string[];
          environment?: string;
          steps: { run?: string; env?: Record<string, string> }[];
        }
      >;
    };
    expect(workflow.on.push.branches).toEqual(["main", "production"]);
    expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
    expect(workflow.concurrency.group).toContain("github.ref_name");
    const resolve = workflow.jobs.resolve?.steps.map((step) => step.run ?? "").join("\n") ?? "";
    // Default chain: main (Development) → production. Behaviour is exercised in promotion.test.ts.
    expect(resolve).toContain('chain="main"');
    expect(resolve).toContain('chain="$chain production"');
    expect(resolve).not.toMatch(/staging|canary/);
    const { migrate, deploy } = workflow.jobs;
    expect(migrate?.needs).toEqual("resolve");
    expect(migrate?.environment).toBe("${{ needs.resolve.outputs.environment }}");
    expect(deploy?.needs).toEqual(["resolve", "migrate"]);
    expect(deploy?.environment).toBe("${{ needs.resolve.outputs.environment }}");
    const migrateStep = migrate?.steps.find((step) => step.run?.includes("db.ts migrate"));
    expect(migrateStep?.env).toEqual({
      DATABASE_DIRECT_URL: "${{ secrets.DATABASE_DIRECT_URL }}",
    });
    const deployRuns = deploy?.steps.map((step) => step.run ?? "").join("\n") ?? "";
    expect(deployRuns).toContain('pnpm "app:secrets:$ENVIRONMENT"');
    expect(deployRuns).toContain('pnpm "app:deploy:$ENVIRONMENT"');
    expect(source).toContain("secrets.APP_ENV_FILE");
    expect(source).not.toContain("APP_ENV_PRODUCTION");
    expect(source).toContain("[branch-deploys]: Published app v");
    expect(source).toContain("slackapi/slack-github-action@v4.0.0");
  });

  it("ships a deployment guide and an environments agent doc that match the workflows", async () => {
    const scaffold = (targetDirectory: string, platform?: "landing") =>
      scaffoldProject({
        targetDirectory,
        appName: "Guide Desk",
        appDescription: "Deployment guide fixture.",
        ...(platform ? { platform } : {}),
        yes: true,
        force: false,
        skipInstall: true,
        skipGit: true,
      });
    const web = await scaffold("guide-desk");
    const read = (relative: string) =>
      fs.readFile(path.join(web.targetDirectory, relative), "utf8");

    const guide = await read("docs/deployment.md");
    const agentDoc = await read("docs/agents/environments.md");
    for (const doc of [guide, agentDoc]) {
      expect(doc).not.toContain("{{");
      expect(doc).not.toContain("m5k:");
    }
    expect(guide).toContain("guide-desk-development");
    expect(guide).toContain("guide-desk-production");
    expect(guide).toMatch(/eviction/i);
    expect(guide).toMatch(/merge commit/i);
    expect(guide).toContain("drizzle:rebuild");
    expect(guide).toMatch(/never rolled back/i);
    const workflowSecrets = new Set<string>();
    for (const name of ["deploy-app.yml", "promotion.yml"]) {
      const source = await read(`.github/workflows/${name}`);
      for (const match of source.matchAll(/secrets\.([A-Z_]+)/g)) workflowSecrets.add(match[1]!);
    }
    expect([...workflowSecrets].sort()).toEqual([
      "APP_ENV_FILE",
      "DATABASE_DIRECT_URL",
      "FLY_API_TOKEN",
      "SLACK_BOT_TOKEN",
      "SLACK_CHANNEL_ID",
    ]);
    for (const secret of workflowSecrets) expect(guide).toContain(`\`${secret}\``);
    expect(guide).toContain("Promotion PR");

    expect(agentDoc).toContain("APP_ENV");
    expect(agentDoc).toMatch(/NODE_ENV/);
    expect(agentDoc).toMatch(/feature PRs/i);
    expect(agentDoc).toMatch(/Production database/);
    expect(await read("AGENTS.md")).toContain("docs/agents/environments.md");

    const landing = await scaffold("guide-desk-landing", "landing");
    await expect(
      fs.stat(path.join(landing.targetDirectory, "docs/deployment.md"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.stat(path.join(landing.targetDirectory, "docs/agents/environments.md"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

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
    ) as {
      engines?: { node?: string };
      packageManager?: string;
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(rootPackage.engines?.node).toBe(">=24");
    expect(rootPackage.packageManager).toBe("pnpm@10.13.1");
    expect(rootPackage.devDependencies?.["@m5kdev/backend"]).toBe("catalog:m5kdev");
    expect(rootPackage.scripts?.["app:deploy:production"]).toBe(
      "m5kdev-fly-deploy --config apps/shared/fly.production.toml --dockerfile apps/shared/Dockerfile --env apps/shared/.env.production"
    );
    expect(rootPackage.scripts?.["app:secrets:production"]).toBe(
      "m5kdev-fly-secrets --config apps/shared/fly.production.toml --env apps/shared/.env.production"
    );
    expect(rootPackage.scripts?.["app:deploy:development"]).toBe(
      "m5kdev-fly-deploy --config apps/shared/fly.development.toml --dockerfile apps/shared/Dockerfile --env apps/shared/.env.development"
    );
    expect(rootPackage.scripts?.["app:secrets:development"]).toBe(
      "m5kdev-fly-secrets --config apps/shared/fly.development.toml --env apps/shared/.env.development"
    );
    // A bare `pnpm app:deploy` / `app:secrets` names the per-environment scripts and fails.
    for (const kind of ["deploy", "secrets"]) {
      const script = rootPackage.scripts?.[`app:${kind}`];
      if (!script) throw new Error(`Missing app:${kind} script`);
      const run = spawnSync("sh", ["-c", script], {
        cwd: result.targetDirectory,
        encoding: "utf8",
      });
      expect(run.status).toBe(1);
      expect(run.stderr).toContain(
        `Use pnpm app:${kind}:<environment> — one of: development, production`
      );
    }

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
    expect(dockerfile).toContain(
      "pnpm --filter=@deploy-desk/server... install --frozen-lockfile --prod=false"
    );
    expect(dockerfile).toContain("required=false");
    expect(dockerfile).toContain("pnpm --filter=@deploy-desk/server build");
    expect(dockerfile).toContain("pnpm --filter=@deploy-desk/webapp build");
    expect(dockerfile).toContain(
      "pnpm --filter=@deploy-desk/server deploy --prod --legacy /deploy"
    );
    expect(dockerfile).toContain("COPY --from=webapp-build /app/apps/webapp/dist/ ./client/");
    expect(dockerfile).toContain('CMD ["node", "index.js"]');
    expect(dockerfile).not.toContain("m5k:webapp");
    expect(dockerfile).not.toContain("{{");

    await expect(
      fs.stat(path.join(result.targetDirectory, "apps/shared/fly.toml"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    const flyToml = await fs.readFile(
      path.join(result.targetDirectory, "apps/shared/fly.production.toml"),
      "utf8"
    );
    expect(flyToml).toContain('app = "deploy-desk-production"');
    expect(flyToml).toContain('primary_region = "iad"');
    expect(flyToml).not.toContain("[[mounts]]");
    expect(flyToml).toContain('memory = "1gb"');
    expect(flyToml).toContain("internal_port = 8080");
    expect(flyToml).toContain("force_https = true");
    expect(flyToml).toContain("min_machines_running = 0");
    expect(flyToml).not.toContain("{{");

    const readme = await fs.readFile(path.join(result.targetDirectory, "README.md"), "utf8");
    expect(readme).not.toContain("fly volumes create");
    expect(readme).not.toContain("libsql_data");
    expect(readme).toContain("have no `[[mounts]]`");

    const envExample = await fs.readFile(
      path.join(result.targetDirectory, "apps/shared/.env.production.example"),
      "utf8"
    );
    expect(envExample).toContain("DATABASE_URL=");
    expect(envExample).toContain("DATABASE_DIRECT_URL=");
    expect(envExample).toContain("REDIS_URL");
    expect(envExample).not.toContain("{{");

    await expect(
      fs.stat(path.join(result.targetDirectory, "apps/shared/scripts/fly-deploy.mjs"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.stat(path.join(result.targetDirectory, "apps/shared/scripts/fly-secrets.mjs"))
    ).rejects.toMatchObject({ code: "ENOENT" });

    const gitignore = await fs.readFile(path.join(result.targetDirectory, ".gitignore"), "utf8");
    expect(gitignore).toMatch(/\.env\.production/);
    expect(gitignore).toMatch(/\.env\.development/);

    const appTs = await fs.readFile(
      path.join(result.targetDirectory, "apps/server/src/app.ts"),
      "utf8"
    );
    expect(appTs).toContain('spa: { root: "./client" }');
  });

  it.each(["web", "expo", "both", "landing"] as const)(
    "ships independent Fly workflows for the %s scaffold",
    async (platform) => {
      const result = await scaffoldProject({
        targetDirectory: `deploy-${platform}`,
        appName: "Deploy Fixture",
        appDescription: "GitHub Actions deployment.",
        platform,
        yes: true,
        force: false,
        skipInstall: true,
        skipGit: true,
      });
      const rootPackage = JSON.parse(
        await fs.readFile(path.join(result.targetDirectory, "package.json"), "utf8")
      );
      const workflowDirectory = path.join(result.targetDirectory, ".github/workflows");
      expect(
        (await fs.readdir(workflowDirectory)).filter((name) => name.startsWith("deploy-")).sort()
      ).toEqual(
        platform === "landing" ? ["deploy-landing.yml"] : ["deploy-app.yml", "deploy-landing.yml"]
      );

      if (platform !== "landing") {
        const appSource = await fs.readFile(path.join(workflowDirectory, "deploy-app.yml"), "utf8");
        const appWorkflow = parse(appSource);
        const appPaths: string[] = appWorkflow.on.push.paths;
        const appTriggers = (file: string) =>
          appPaths.some((pattern) => path.matchesGlob(file, pattern));
        expect(appTriggers("apps/landing/src/LandingPage.tsx")).toBe(false);
        expect(appTriggers("apps/server/src/index.ts")).toBe(true);
        expect(appTriggers("apps/webapp/src/App.tsx")).toBe(platform !== "expo");
        expect(appTriggers("apps/expo/src/index.ts")).toBe(false);
        expect(appTriggers(".github/workflows/deploy-app.yml")).toBe(true);
        expect(appSource).toContain("[deploy-fixture]: Published app v");
        expect(appSource).toContain("slackapi/slack-github-action@v4.0.0");
        for (const environment of ["development", "production"]) {
          const deployScript: string = rootPackage.scripts[`app:deploy:${environment}`];
          for (const flag of ["config", "dockerfile"]) {
            const relativePath = deployScript.match(new RegExp(`--${flag} (\\S+)`))?.[1];
            if (!relativePath) throw new Error(`Missing --${flag} in app:deploy:${environment}`);
            await expect(
              fs.stat(path.join(result.targetDirectory, relativePath))
            ).resolves.toBeTruthy();
          }
          const envPath = deployScript.match(/--env (\S+)/)?.[1];
          expect(envPath).toBe(`apps/shared/.env.${environment}`);
          expect(rootPackage.scripts[`app:secrets:${environment}`]).toContain(`--env ${envPath}`);
          await expect(
            fs.stat(path.join(result.targetDirectory, `${envPath}.example`))
          ).resolves.toBeTruthy();
        }
      }

      for (const target of ["landing"]) {
        const source = await fs.readFile(
          path.join(workflowDirectory, `deploy-${target}.yml`),
          "utf8"
        );
        expect(source).not.toContain("m5k:");
        const workflow = parse(source);
        expect(workflow.on.push.branches).toEqual(["main"]);
        expect(workflow.on).toHaveProperty("workflow_dispatch");
        expect(workflow.on).not.toHaveProperty("pull_request");
        expect(workflow.jobs.deploy.if).toBe("github.ref == 'refs/heads/main'");

        const paths: string[] = workflow.on.push.paths;
        const triggers = (file: string) => paths.some((pattern) => path.matchesGlob(file, pattern));
        expect(triggers("apps/landing/src/LandingPage.tsx")).toBe(target === "landing");
        expect(triggers("apps/server/src/index.ts")).toBe(target === "app");
        expect(triggers("apps/shared/src/modules/app/app.constants.ts")).toBe(target === "app");
        expect(triggers("apps/email/src/resources.ts")).toBe(target === "app");
        expect(triggers("apps/webapp/src/App.tsx")).toBe(target === "app" && platform !== "expo");
        expect(triggers("pnpm-lock.yaml")).toBe(true);
        expect(triggers("pnpm-workspace.yaml")).toBe(true);
        expect(triggers("package.json")).toBe(true);
        expect(triggers(".dockerignore")).toBe(true);
        expect(triggers(`.github/workflows/deploy-${target}.yml`)).toBe(true);
        expect(triggers("README.md")).toBe(false);
        expect(triggers("apps/expo/src/index.ts")).toBe(false);
        expect(triggers("apps/e2e/tests/standard.spec.ts")).toBe(false);

        const step = workflow.jobs.deploy.steps.find(
          (entry: { env?: Record<string, string> }) => entry.env?.FLY_API_TOKEN
        );
        // GitHub expressions survive the CLI's own template rendering.
        expect(step.env.FLY_API_TOKEN).toBe(
          `\${{ secrets.FLY_API_TOKEN_${target.toUpperCase()} }}`
        );
        expect(step.env.ENV_PRODUCTION).toBe(
          `\${{ secrets.${target.toUpperCase()}_ENV_PRODUCTION }}`
        );
        expect(step.run).toContain(`pnpm ${target}:secrets`);
        expect(step.run).toContain(`pnpm ${target}:deploy`);
        const deployScript: string = rootPackage.scripts[`${target}:deploy`];
        const secretScript: string = rootPackage.scripts[`${target}:secrets`];
        expect(deployScript).toContain("m5kdev-fly-deploy");
        expect(secretScript).toContain("m5kdev-fly-secrets");
        for (const flag of ["config", "dockerfile"]) {
          const relativePath = deployScript.match(new RegExp(`--${flag} (\\S+)`))?.[1];
          if (!relativePath) throw new Error(`Missing --${flag} in ${target}:deploy`);
          await expect(
            fs.stat(path.join(result.targetDirectory, relativePath))
          ).resolves.toBeTruthy();
        }
        const envPath = deployScript.match(/--env (\S+)/)?.[1];
        expect(envPath).toBeDefined();
        expect(step.run).toContain(`> ${envPath}`);
        expect(secretScript).toContain(`--env ${envPath}`);
        await expect(
          fs.stat(path.join(result.targetDirectory, `${envPath}.example`))
        ).resolves.toBeTruthy();
        expect(workflow.jobs.deploy.steps.at(-1)).toMatchObject({
          if: "always()",
          run: `rm -f ${envPath}`,
        });
        expect(source).toContain("[deploy-fixture]: Published landing v");
        expect(source).toContain("slackapi/slack-github-action@v4.0.0");
      }
    }
  );

  it.each(["web", "expo", "both", "landing"] as const)(
    "ships complete Docker inputs for the %s scaffold",
    async (platform) => {
      const result = await scaffoldProject({
        targetDirectory: `docker-${platform}`,
        appName: "Docker Fixture",
        appDescription: "Docker build inputs.",
        platform,
        yes: true,
        force: false,
        skipInstall: true,
        skipGit: true,
      });
      const workspace = parse(
        await fs.readFile(path.join(result.targetDirectory, "pnpm-workspace.yaml"), "utf8")
      );
      expect(workspace.overrides).toEqual({ "drizzle-orm>@libsql/client": "-" });

      const dockerfiles = ["apps/landing/Dockerfile"];
      if (platform !== "landing") dockerfiles.push("apps/shared/Dockerfile");
      for (const dockerfilePath of dockerfiles) {
        const dockerfile = await fs.readFile(
          path.join(result.targetDirectory, dockerfilePath),
          "utf8"
        );
        const stages = new Set([...dockerfile.matchAll(/^FROM .+ AS (\S+)$/gm)].map((m) => m[1]));
        for (const line of dockerfile.split("\n").filter((line) => line.startsWith("COPY "))) {
          const from = line.match(/--from=(\S+)/);
          if (from) {
            expect(stages.has(from[1])).toBe(true);
            continue;
          }
          for (const source of line.split(/\s+/).slice(1, -1)) {
            // The initial pnpm install creates this after scaffolding.
            if (source === "pnpm-lock.yaml") continue;
            await expect(fs.stat(path.join(result.targetDirectory, source))).resolves.toBeTruthy();
          }
        }
      }

      const caddyfile = await fs.readFile(
        path.join(result.targetDirectory, "apps/landing/Caddyfile"),
        "utf8"
      );
      expect(caddyfile).toContain(":8080");
      expect(caddyfile).toContain("try_files {path} /index.html");
      const landingDockerfile = await fs.readFile(
        path.join(result.targetDirectory, "apps/landing/Dockerfile"),
        "utf8"
      );
      const runtime = landingDockerfile.slice(landingDockerfile.lastIndexOf("\nFROM "));
      expect(runtime).toContain("FROM caddy:2-alpine AS runtime");
      expect(runtime).toContain("COPY apps/landing/Caddyfile /etc/caddy/Caddyfile");
      expect(runtime).toContain("COPY --from=build /app/apps/landing/dist/ /srv/");
      expect(runtime).not.toMatch(/\b(?:npm|pnpm|vite)\b/);
      const state = JSON.parse(
        await fs.readFile(path.join(result.targetDirectory, ".m5kdev.json"), "utf8")
      );
      expect(state.files["apps/landing/Caddyfile"].kind).toBe("text");
    }
  );

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
        fs.stat(path.join(result.targetDirectory, "apps/landing/.env"))
      ).rejects.toMatchObject({
        code: "ENOENT",
      });
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
      ) as {
        engines?: { node?: string };
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      expect(rootPackage.engines?.node).toBe(">=24");
      expect(rootPackage.devDependencies?.["@m5kdev/backend"]).toBe("catalog:m5kdev");
      expect(rootPackage.scripts?.["landing:deploy"]).toContain("m5kdev-fly-deploy");
      expect(rootPackage.scripts?.["landing:deploy"]).toContain("apps/landing/fly.toml");
      expect(rootPackage.scripts?.["landing:secrets"]).toContain("m5kdev-fly-secrets");
      expect(rootPackage.scripts?.["landing:secrets"]).toContain("apps/landing/.env.production");

      await expect(
        fs.stat(path.join(result.targetDirectory, "apps/landing/.env.production.example"))
      ).resolves.toBeTruthy();
      await expect(
        fs.stat(path.join(result.targetDirectory, "apps/landing/scripts/fly-deploy.mjs"))
      ).rejects.toMatchObject({ code: "ENOENT" });
      await expect(
        fs.stat(path.join(result.targetDirectory, "apps/landing/scripts/fly-secrets.mjs"))
      ).rejects.toMatchObject({ code: "ENOENT" });

      const landingPage = await fs.readFile(
        path.join(result.targetDirectory, "apps/landing/src/LandingPage.tsx"),
        "utf8"
      );
      expect(landingPage).not.toContain("VITE_APP_URL");
      expect(landingPage).not.toContain("Open app");
      expect(landingPage).toContain('from "@heroui/react"');
    }

    const expoDocker = await fs.readFile(
      path.join(expo.targetDirectory, "apps/shared/Dockerfile"),
      "utf8"
    );
    expect(expoDocker).toContain("pnpm --filter=@landing-expo/server build");
    expect(expoDocker).not.toContain("webapp build");
    expect(expoDocker).not.toContain("webapp");
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
    expect(expoAppTs).not.toContain("AIModule");
    expect(expoAppTs).not.toContain("m5k:");
  });

  it("scaffolds landing-only without a Kernel, Webapp, or Expo", async () => {
    const result = await scaffoldProject({
      targetDirectory: "landing-only",
      appName: "Landing Only",
      appDescription: "Public site fixture.",
      platform: "landing",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });

    await expect(
      fs.stat(path.join(result.targetDirectory, "apps/landing/package.json"))
    ).resolves.toBeTruthy();
    await expect(fs.stat(path.join(result.targetDirectory, "apps/server"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.stat(path.join(result.targetDirectory, "apps/webapp"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.stat(path.join(result.targetDirectory, "apps/expo"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.stat(path.join(result.targetDirectory, "apps/email"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.stat(path.join(result.targetDirectory, "apps/shared"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const rootPackage = JSON.parse(
      await fs.readFile(path.join(result.targetDirectory, "package.json"), "utf8")
    ) as { scripts?: Record<string, string>; devDependencies?: Record<string, string> };
    expect(rootPackage.scripts?.["landing:deploy"]).toContain("apps/landing/fly.toml");
    expect(rootPackage.scripts?.["app:deploy"]).toBeUndefined();
    expect(rootPackage.scripts?.["app:secrets"]).toBeUndefined();
    expect(rootPackage.devDependencies?.["@m5kdev/backend"]).toBe("catalog:m5kdev");

    const landingEnv = await fs.readFile(
      path.join(result.targetDirectory, "apps/landing/.env"),
      "utf8"
    );
    expect(landingEnv).toContain("VITE_APP_NAME=Landing Only");

    const landingVite = await fs.readFile(
      path.join(result.targetDirectory, "apps/landing/vite.config.ts"),
      "utf8"
    );
    expect(landingVite).not.toContain("envDir");
    expect(landingVite).not.toContain("m5k:");

    const landingGlossary = await fs.readFile(
      path.join(result.targetDirectory, "GLOSSARY.md"),
      "utf8"
    );
    expect(landingGlossary).toContain("# Landing Only");
    expect(landingGlossary).toContain("## Language");
    expect(landingGlossary).not.toContain("**Organization**:");
    expect(landingGlossary).not.toContain("**Admin panel**:");
    expect(landingGlossary).not.toContain("m5k:");
    await expect(
      fs.stat(path.join(result.targetDirectory, "docs/agents/issue-tracker.md"))
    ).resolves.toBeTruthy();
    await expect(
      fs.stat(path.join(result.targetDirectory, "docs/adr/.gitkeep"))
    ).resolves.toBeTruthy();

    const landingAgents = await fs.readFile(path.join(result.targetDirectory, "AGENTS.md"), "utf8");
    expect(landingAgents).toContain("## Agent skills");

    const landingPage = await fs.readFile(
      path.join(result.targetDirectory, "apps/landing/src/LandingPage.tsx"),
      "utf8"
    );
    expect(landingPage).not.toContain("VITE_APP_URL");
    expect(landingPage).not.toContain("Open app");
    expect(landingPage).toContain("Landing Only");

    const readme = await fs.readFile(path.join(result.targetDirectory, "README.md"), "utf8");
    expect(readme).not.toContain("apps/webapp");
    expect(readme).not.toContain("apps/server");
    expect(readme).not.toContain("app:deploy");
    expect(readme).toContain("apps/landing");

    const source = await fs.readFile(path.join(result.targetDirectory, ".m5kdev.json"), "utf8");
    const state = JSON.parse(source) as {
      template: { features: string[] };
      catalog: Record<string, string>;
    };
    expect(state.template.features).toEqual(["docs-landing"]);
    expect(state.catalog).not.toHaveProperty("react-native-web");
  });

  it("refuses a test harness on landing-only create", async () => {
    await expect(
      scaffoldProject({
        targetDirectory: "landing-harness",
        appName: "Landing Harness",
        appDescription: "Harness should be refused.",
        platform: "landing",
        testHarness: true,
        yes: true,
        force: false,
        skipInstall: true,
        skipGit: true,
      })
    ).rejects.toThrow(/test harness/i);
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

describe("landing-only platform upgrade", () => {
  let tempRoot = "";
  let initialCwd = "";

  beforeEach(async () => {
    initialCwd = process.cwd();
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-cli-upgrade-"));
    process.chdir(tempRoot);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    process.chdir(initialCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  async function scaffoldLanding(directory: string) {
    return scaffoldProject({
      targetDirectory: directory,
      appName: "Upgrade Desk",
      appDescription: "Landing upgrade fixture.",
      platform: "landing",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });
  }

  it("upgrades landing-only to web without replacing customized Landing sources", async () => {
    const { updateManagedRepo } = await import("../update");
    const result = await scaffoldLanding("upgrade-web");
    const landingPagePath = path.join(result.targetDirectory, "apps/landing/src/LandingPage.tsx");
    await fs.writeFile(
      landingPagePath,
      "export function LandingPage() { return <p>Custom pitch</p>; }\n"
    );

    const update = await updateManagedRepo({
      repoRoot: result.targetDirectory,
      dryRun: false,
      skipInstall: true,
      yes: true,
      platform: "web",
      assertClean: async () => undefined,
      install: async () => undefined,
    });
    expect(update.applied).toBe(true);
    expect(update.conflicts).toEqual([]);

    await expect(
      fs.stat(path.join(result.targetDirectory, ".github/workflows/deploy-app.yml"))
    ).resolves.toBeTruthy();
    await expect(
      fs.stat(path.join(result.targetDirectory, "apps/server/package.json"))
    ).resolves.toBeTruthy();
    await expect(
      fs.stat(path.join(result.targetDirectory, "apps/shared/package.json"))
    ).resolves.toBeTruthy();
    await expect(
      fs.stat(path.join(result.targetDirectory, "apps/email/package.json"))
    ).resolves.toBeTruthy();
    await expect(
      fs.stat(path.join(result.targetDirectory, "apps/webapp/package.json"))
    ).resolves.toBeTruthy();
    await expect(fs.stat(path.join(result.targetDirectory, "apps/expo"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    expect(await fs.readFile(landingPagePath, "utf8")).toContain("Custom pitch");

    const sharedEnv = await fs.readFile(
      path.join(result.targetDirectory, "apps/shared/.env"),
      "utf8"
    );
    expect(sharedEnv).toContain("VITE_APP_NAME=Upgrade Desk");
    await expect(
      fs.stat(path.join(result.targetDirectory, "apps/landing/.env"))
    ).rejects.toMatchObject({
      code: "ENOENT",
    });

    const landingVite = await fs.readFile(
      path.join(result.targetDirectory, "apps/landing/vite.config.ts"),
      "utf8"
    );
    expect(landingVite).toContain('envDir: "../shared"');

    const state = JSON.parse(
      await fs.readFile(path.join(result.targetDirectory, ".m5kdev.json"), "utf8")
    ) as { template: { features: string[] } };
    expect(state.template.features).toEqual(["docs-landing", "webapp"]);

    const glossary = await fs.readFile(path.join(result.targetDirectory, "GLOSSARY.md"), "utf8");
    expect(glossary).toContain("**Organization**:");

    const report = await diagnoseManagedRepo({ repoRoot: result.targetDirectory });
    expect(report.ok).toBe(true);
  });

  it("plans a landing-only to web upgrade without writing", async () => {
    const { updateManagedRepo } = await import("../update");
    const result = await scaffoldLanding("upgrade-dry-run");
    const update = await updateManagedRepo({
      repoRoot: result.targetDirectory,
      dryRun: true,
      skipInstall: true,
      yes: true,
      platform: "web",
      assertClean: async () => undefined,
    });
    expect(update.applied).toBe(false);
    expect(update.dryRun).toBe(true);
    expect(update.changes.map((change) => `${change.kind}:${change.path}`)).toEqual(
      expect.arrayContaining([
        "add:apps/server/package.json",
        "add:apps/shared/package.json",
        "add:apps/email/package.json",
        "add:apps/webapp/package.json",
        "add:apps/shared/.env",
      ])
    );
    await expect(fs.stat(path.join(result.targetDirectory, "apps/server"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("upgrades landing-only to expo without a Webapp", async () => {
    const { updateManagedRepo } = await import("../update");
    const result = await scaffoldLanding("upgrade-expo");
    const update = await updateManagedRepo({
      repoRoot: result.targetDirectory,
      dryRun: false,
      skipInstall: true,
      yes: true,
      platform: "expo",
      assertClean: async () => undefined,
      install: async () => undefined,
    });
    expect(update.applied).toBe(true);
    await expect(
      fs.stat(path.join(result.targetDirectory, "apps/expo/package.json"))
    ).resolves.toBeTruthy();
    await expect(fs.stat(path.join(result.targetDirectory, "apps/webapp"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      fs.stat(path.join(result.targetDirectory, "apps/server/package.json"))
    ).resolves.toBeTruthy();
  });

  it("upgrades landing-only to both clients", async () => {
    const { updateManagedRepo } = await import("../update");
    const result = await scaffoldLanding("upgrade-both");
    const update = await updateManagedRepo({
      repoRoot: result.targetDirectory,
      dryRun: false,
      skipInstall: true,
      yes: true,
      platform: "both",
      assertClean: async () => undefined,
      install: async () => undefined,
    });
    expect(update.applied).toBe(true);
    await expect(
      fs.stat(path.join(result.targetDirectory, "apps/webapp/package.json"))
    ).resolves.toBeTruthy();
    await expect(
      fs.stat(path.join(result.targetDirectory, "apps/expo/package.json"))
    ).resolves.toBeTruthy();
  });

  it("refuses update --platform on an app that already has a Webapp", async () => {
    const { updateManagedRepo } = await import("../update");
    const web = await scaffoldProject({
      targetDirectory: "already-web",
      appName: "Already Web",
      appDescription: "Already has a Webapp.",
      platform: "web",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });
    await expect(
      updateManagedRepo({
        repoRoot: web.targetDirectory,
        dryRun: true,
        skipInstall: true,
        yes: true,
        platform: "expo",
        assertClean: async () => undefined,
      })
    ).rejects.toThrow(/landing-only/i);
  });

  it("refuses update --platform landing", async () => {
    const { updateManagedRepo } = await import("../update");
    const result = await scaffoldLanding("no-downgrade");
    await expect(
      updateManagedRepo({
        repoRoot: result.targetDirectory,
        dryRun: true,
        skipInstall: true,
        yes: true,
        platform: "landing",
        assertClean: async () => undefined,
      })
    ).rejects.toThrow(/landing/i);
  });

  it("refuses update --platform web on expo-only", async () => {
    const { updateManagedRepo } = await import("../update");
    const expo = await scaffoldProject({
      targetDirectory: "already-expo",
      appName: "Already Expo",
      appDescription: "Expo-only fixture.",
      platform: "expo",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });
    await expect(
      updateManagedRepo({
        repoRoot: expo.targetDirectory,
        dryRun: true,
        skipInstall: true,
        yes: true,
        platform: "web",
        assertClean: async () => undefined,
      })
    ).rejects.toThrow(/landing-only/i);
  });
});
