import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { parse } from "yaml";
import { scaffoldProject } from "../create";
import { getTemplateRoot } from "../paths";
import { reconcileTemplates } from "../reconcile";
import { readManagedState } from "../state";

describe("generated public product help", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-product-docs-"));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it.each([
    { platform: "landing", modules: [], guides: ["index.md"] },
    { platform: "web", modules: [], guides: ["index.md", "posts.md", "signing-in.md"] },
    { platform: "expo", modules: ["files", "ai"], guides: ["index.md", "signing-in.md"] },
    {
      platform: "both",
      modules: ["files", "ai", "workflows", "notifications"],
      guides: [
        "conversation.md",
        "files.md",
        "index.md",
        "notifications-mobile.md",
        "notifications-web.md",
        "posts.md",
        "signing-in.md",
        "workflows.md",
      ],
    },
  ] as const)(
    "ships only applicable guides for $platform ($modules)",
    async ({ platform, modules, guides }) => {
      const { targetDirectory } = await scaffoldProject({
        targetDirectory: path.join(tempRoot, "fixture"),
        appName: "Public Help",
        appDescription: "A product with public help.",
        platform,
        docsHosting: "standalone",
        modules: [...modules],
        yes: true,
        force: false,
        skipInstall: true,
        skipGit: true,
      });
      const read = (file: string) => fs.readFile(path.join(targetDirectory, file), "utf8");
      expect((await fs.readdir(path.join(targetDirectory, "apps/docs/docs"))).sort()).toEqual(
        [...guides].sort()
      );
      const config = await read("apps/docs/docusaurus.config.ts");
      expect(config).toContain("APP_LOCALE_CONFIG");
      expect(config).toContain('type: "localeDropdown"');
      expect(await read("apps/locales.ts")).toContain('code: "en_GB"');
      expect(
        (
          await fs.readdir(
            path.join(
              targetDirectory,
              "apps/docs/i18n/en-GB/docusaurus-plugin-content-docs/current"
            )
          )
        ).sort()
      ).toEqual([...guides].sort());
      expect(config).toContain("Public Help Help");
      expect(await read("apps/documentation.ts")).toContain("https://public-help-docs.fly.dev/");
      expect(config).not.toMatch(/starter-app|m5kdev.local|{{/);
      expect(await read("apps/docs/fly.toml")).toContain('app = "public-help-docs"');
      expect(await read("apps/docs/.env.production.example")).toContain(
        "https://public-help-docs.fly.dev"
      );
      const pkg = JSON.parse(await read("package.json"));
      expect(pkg.scripts["docs:deploy"]).toContain("m5kdev-fly-deploy --config apps/docs/fly.toml");
      expect(pkg.scripts["docs:build"]).toBe("pnpm --filter ./apps/docs build");
      expect(await read("apps/landing/src/LandingPage.tsx")).toContain("getDocumentationUrl");
      expect(await read("AGENTS.md")).toContain("docs/agents/product-documentation.md");
      const source = await read(".github/workflows/deploy-docs.yml");
      const workflow = parse(source);
      const triggers = (file: string) =>
        workflow.on.push.paths.some((pattern: string) => path.matchesGlob(file, pattern));
      expect(triggers("apps/docs/docs/posts.md")).toBe(true);
      expect(triggers("apps/server/src/app.ts")).toBe(false);
      expect(triggers("apps/landing/src/LandingPage.tsx")).toBe(false);
      expect(workflow.on.push.branches).toEqual(["main"]);
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
      expect(source).toContain("${{ secrets.FLY_API_TOKEN_DOCS }}");
      expect(source).toContain("pnpm docs:deploy");
      expect(source).not.toContain("docs:secrets");
      expect(workflow.jobs.deploy.steps.at(-1).run).toBe("rm -f apps/docs/.env.production");
      expect(await read(".github/workflows/check.yml")).toContain("pnpm docs:build");
    }
  );

  it.each(["landing", "web", "expo", "both"] as const)(
    "bundles help with Landing by default for %s and retains the selection on update",
    async (platform) => {
      const { targetDirectory } = await scaffoldProject({
        targetDirectory: path.join(tempRoot, "bundled"),
        platform,
        yes: true,
        force: false,
        skipInstall: true,
        skipGit: true,
      });
      const read = (file: string) => fs.readFile(path.join(targetDirectory, file), "utf8");
      const state = await readManagedState(targetDirectory);
      expect(state.template.features).toContain("docs-landing");
      expect(await read("apps/documentation.ts")).toContain('= "landing"');
      expect(await read("apps/landing/Dockerfile")).toContain("/srv/documentation/");
      expect(await read("apps/landing/Caddyfile")).toContain("handle_path /documentation/*");
      expect(await read(".github/workflows/deploy-landing.yml")).toContain("apps/docs/**");
      expect(
        await fs.access(path.join(targetDirectory, ".github/workflows/deploy-docs.yml")).then(
          () => true,
          () => false
        )
      ).toBe(false);
      const translation = "apps/docs/i18n/en-GB/docusaurus-plugin-content-docs/current/index.md";
      await fs.writeFile(path.join(targetDirectory, translation), "# Custom local help\n");
      const result = await reconcileTemplates({
        repoRoot: targetDirectory,
        state,
        targetTemplateRoot: getTemplateRoot(),
        targetVersion: state.template.version,
      });
      expect(result.changes.conflicts).toEqual([]);
      expect(result.targetState.template.features).toContain("docs-landing");
      expect(await read(translation)).toBe("# Custom local help\n");
    }
  );

  it("preserves app-written guides and restores missing guides during an update", async () => {
    const { targetDirectory } = await scaffoldProject({
      targetDirectory: path.join(tempRoot, "fixture"),
      appName: "Help Fixture",
      appDescription: "Customized product help.",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });
    const state = await readManagedState(targetDirectory);
    const customGuide = "# Write a story\n\nProduct-specific instructions.\n";
    await fs.writeFile(path.join(targetDirectory, "apps/docs/docs/posts.md"), customGuide);
    await fs.rm(path.join(targetDirectory, "apps/docs/docs/signing-in.md"));
    const result = await reconcileTemplates({
      repoRoot: targetDirectory,
      state,
      targetTemplateRoot: getTemplateRoot(),
      targetVersion: state.template.version,
    });
    expect(result.changes.conflicts).toEqual([]);
    expect(
      [...result.changes.changes.values()].filter(({ path: file }) =>
        file.startsWith("apps/docs/docs/")
      )
    ).toMatchObject([{ kind: "add", path: "apps/docs/docs/signing-in.md" }]);
    expect(await fs.readFile(path.join(targetDirectory, "apps/docs/docs/posts.md"), "utf8")).toBe(
      customGuide
    );
  });

  it("keeps legacy apps on standalone hosting during an update", async () => {
    const { targetDirectory } = await scaffoldProject({
      targetDirectory: path.join(tempRoot, "legacy"),
      docsHosting: "standalone",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });
    const state = await readManagedState(targetDirectory);
    state.template.features = state.template.features.filter(
      (feature) => !feature.startsWith("docs-")
    );
    const result = await reconcileTemplates({
      repoRoot: targetDirectory,
      state,
      targetTemplateRoot: getTemplateRoot(),
      targetVersion: state.template.version,
    });
    expect(result.changes.conflicts).toEqual([]);
    expect([...result.changes.changes.keys()]).not.toContain("apps/documentation.ts");
    expect(
      await fs.readFile(path.join(targetDirectory, "apps/documentation.ts"), "utf8")
    ).toContain('= "standalone"');
  });

  it.each(["web", "expo", "both"] as const)(
    "bundles server-hosted help for %s without changing Landing",
    async (platform) => {
      const { targetDirectory } = await scaffoldProject({
        targetDirectory: path.join(tempRoot, "server"),
        platform,
        docsHosting: "server",
        yes: true,
        force: false,
        skipInstall: true,
        skipGit: true,
      });
      const read = (file: string) => fs.readFile(path.join(targetDirectory, file), "utf8");
      expect(await read("apps/documentation.ts")).toContain('= "server"');
      expect(await read("apps/server/src/app.ts")).toContain(
        'documentation: { root: "./documentation" }'
      );
      expect(await read("apps/shared/Dockerfile")).toContain(
        "COPY --from=docs-build /app/apps/docs/build/ ./documentation/"
      );
      expect(await read("apps/landing/Dockerfile")).not.toContain("docs-build");
      expect(await read(".github/workflows/deploy-app.yml")).toContain("apps/docs/**");
      const program = ts.createProgram([path.join(targetDirectory, "apps/server/src/app.ts")], {
        noEmit: true,
        noResolve: true,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        skipLibCheck: true,
      });
      expect(
        program
          .getSemanticDiagnostics()
          .filter((diagnostic) => diagnostic.code === 2304)
          .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " "))
      ).toEqual([]);
    }
  );

  it.each(["server", "invalid"])(
    "rejects unsupported %s hosting for Landing-only",
    async (docsHosting) => {
      await expect(
        scaffoldProject({
          targetDirectory: path.join(tempRoot, "invalid"),
          platform: "landing",
          // @ts-expect-error Exercise validation of unsupported input as well as the server choice.
          docsHosting,
          yes: true,
          force: false,
          skipInstall: true,
          skipGit: true,
        })
      ).rejects.toThrow(/documentation hosting/);
    }
  );
});
