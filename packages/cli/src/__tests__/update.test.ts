import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectTemplateFiles, copyTemplateDirectory } from "../fs";
import { ensureNamedImport, transformTypeScript } from "../migrations/ast";
import type { MigrationDefinition } from "../migrations/types";
import type { BaseTemplateProvider } from "../reconcile";
import { createManagedState, readManagedState, writeManagedState } from "../state";
import type { TemplateFeatureManifest } from "../types";
import { updateManagedRepo } from "../update";

const context = {
  appName: "Fixture",
  appDescription: "Update fixture.",
  appSlug: "fixture",
  packageScope: "@fixture",
  betterAuthSecret: "secret",
};

async function makeTemplate(
  root: string,
  options: {
    catalogVersion: string;
    source: string;
  }
): Promise<TemplateFeatureManifest> {
  const manifest: TemplateFeatureManifest = {
    schemaVersion: 1,
    features: {},
    requiredPaths: ["package.json", "pnpm-workspace.yaml"],
    sync: { defaultPolicy: "merge", rules: [], renames: [] },
  };
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, "template.manifest.json"), JSON.stringify(manifest));
  await fs.writeFile(
    path.join(root, "pnpm-workspace.yaml.tpl"),
    ["packages:", "  - apps/**", "catalog:", `  dependency: ${options.catalogVersion}`, ""].join(
      "\n"
    )
  );
  await fs.writeFile(
    path.join(root, "package.json.tpl"),
    JSON.stringify(
      {
        name: "{{APP_SLUG}}",
        dependencies: { dependency: "catalog:" },
      },
      null,
      2
    )
  );
  await fs.writeFile(path.join(root, "source.ts.tpl"), options.source);
  return manifest;
}

async function fixture(tempRoot: string, baseOptions: { catalogVersion: string; source: string }) {
  const baseRoot = path.join(tempRoot, "base");
  const repoRoot = path.join(tempRoot, "repo");
  const manifest = await makeTemplate(baseRoot, baseOptions);
  const rendered = await collectTemplateFiles(baseRoot, context);
  await fs.mkdir(repoRoot, { recursive: true });
  await copyTemplateDirectory(baseRoot, repoRoot, context);
  const state = createManagedState({
    templateVersion: "0.31.0",
    enabledFeatures: new Set(),
    context,
    renderedFiles: rendered,
    manifest,
  });
  await writeManagedState(repoRoot, state);
  const baseProvider: BaseTemplateProvider = {
    getTemplateRoot: async () => ({ root: baseRoot, cleanup: async () => undefined }),
  };
  return { baseProvider, baseRoot, repoRoot, state };
}

async function snapshot(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function walk(directory: string, prefix = "") {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute, relative);
      else result[relative] = (await fs.readFile(absolute)).toString("base64");
    }
  }
  await walk(root);
  return result;
}

describe("managed update", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-update-"));
  });
  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("performs a complete dry-run with zero writes", async () => {
    const setup = await fixture(tempRoot, {
      catalogVersion: "1.0.0",
      source: "export const value = 1;\n",
    });
    const targetRoot = path.join(tempRoot, "target");
    await makeTemplate(targetRoot, {
      catalogVersion: "2.0.0",
      source: "export const value = 2;\n",
    });
    const before = await snapshot(setup.repoRoot);
    const result = await updateManagedRepo({
      repoRoot: setup.repoRoot,
      dryRun: true,
      skipInstall: false,
      targetTemplateRoot: targetRoot,
      targetVersion: "0.32.0",
      baseProvider: setup.baseProvider,
    });
    expect(result.applied).toBe(false);
    expect(result.dependenciesChanged).toBe(true);
    expect(result.changes.map(({ path: filePath }) => filePath)).toEqual(
      expect.arrayContaining([".m5kdev.json", "pnpm-workspace.yaml", "source.ts"])
    );
    expect(await snapshot(setup.repoRoot)).toEqual(before);
  });

  it("aborts a write-mode plan atomically on conflict", async () => {
    const setup = await fixture(tempRoot, {
      catalogVersion: "1.0.0",
      source: "export const value = 1;\n",
    });
    await fs.writeFile(path.join(setup.repoRoot, "source.ts"), "export const value = 10;\n");
    const targetRoot = path.join(tempRoot, "target");
    await makeTemplate(targetRoot, {
      catalogVersion: "2.0.0",
      source: "export const value = 20;\n",
    });
    const before = await snapshot(setup.repoRoot);
    const result = await updateManagedRepo({
      repoRoot: setup.repoRoot,
      dryRun: false,
      skipInstall: true,
      targetTemplateRoot: targetRoot,
      targetVersion: "0.32.0",
      baseProvider: setup.baseProvider,
      assertClean: async () => undefined,
    });
    expect(result.applied).toBe(false);
    expect(result.conflicts).not.toEqual([]);
    expect(await snapshot(setup.repoRoot)).toEqual(before);
  });

  it.each([false, true])(
    "installs catalog-only updates unless skip-install is %s",
    async (skipInstall) => {
      const caseRoot = path.join(tempRoot, String(skipInstall));
      await fs.mkdir(caseRoot);
      const setup = await fixture(caseRoot, {
        catalogVersion: "1.0.0",
        source: "export const value = 1;\n",
      });
      const targetRoot = path.join(caseRoot, "target");
      await makeTemplate(targetRoot, {
        catalogVersion: "2.0.0",
        source: "export const value = 1;\n",
      });
      const install = jest.fn(async () => undefined);
      const result = await updateManagedRepo({
        repoRoot: setup.repoRoot,
        dryRun: false,
        skipInstall,
        targetTemplateRoot: targetRoot,
        targetVersion: "0.32.0",
        baseProvider: setup.baseProvider,
        assertClean: async () => undefined,
        install,
      });
      expect(result.applied).toBe(true);
      expect(result.dependenciesChanged).toBe(true);
      expect(result.installRequired).toBe(skipInstall);
      expect(install).toHaveBeenCalledTimes(skipInstall ? 0 : 1);
    }
  );

  it("applies a fixture migration, validates it, and records its ID", async () => {
    const setup = await fixture(tempRoot, {
      catalogVersion: "1.0.0",
      source: "export const value = 1;\n",
    });
    const targetRoot = path.join(tempRoot, "target");
    await makeTemplate(targetRoot, {
      catalogVersion: "1.0.0",
      source: "export const value = 1;\n",
    });
    const migration: MigrationDefinition = {
      id: "fixture-add-import",
      targetVersion: "0.32.0",
      description: "Add helper import.",
      guide: "fixture-guide",
      plan: async ({ changes }) => {
        const source = (await changes.read("source.ts"))?.toString("utf8") ?? "";
        changes.addChange({
          kind: "modify",
          path: "source.ts",
          content: Buffer.from(
            transformTypeScript(source, "source.ts", ensureNamedImport("fixture-lib", "helper"))
          ),
          reason: "Fixture AST migration",
        });
      },
      validate: async ({ changes }) => [
        {
          code: "FIXTURE_IMPORT_MISSING",
          severity: (await changes.read("source.ts"))?.toString().includes("fixture-lib")
            ? "info"
            : "error",
          message: "Fixture import validation.",
          path: "source.ts",
        },
      ],
    };
    const result = await updateManagedRepo({
      repoRoot: setup.repoRoot,
      dryRun: false,
      skipInstall: true,
      targetTemplateRoot: targetRoot,
      targetVersion: "0.32.0",
      baseProvider: setup.baseProvider,
      registry: [migration],
      assertClean: async () => undefined,
    });
    expect(result.applied).toBe(true);
    expect(result.migrations).toEqual([migration.id]);
    expect(await fs.readFile(path.join(setup.repoRoot, "source.ts"), "utf8")).toContain(
      "fixture-lib"
    );
    expect((await readManagedState(setup.repoRoot)).appliedMigrations).toContain(migration.id);
  });
});
