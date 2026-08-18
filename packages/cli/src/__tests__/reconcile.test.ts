import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectTemplateFiles, copyTemplateDirectory } from "../fs";
import { type BaseTemplateProvider, reconcileTemplates } from "../reconcile";
import { createManagedState, type ManagedState } from "../state";
import { getExcludedFeaturePaths } from "../template";
import type { TemplateFeatureManifest } from "../types";

const context = {
  appName: "Fixture",
  appDescription: "A fixture.",
  appSlug: "fixture",
  packageScope: "@fixture",
  betterAuthSecret: "not-persisted",
};

type TemplateOptions = {
  features?: TemplateFeatureManifest["features"];
  rules?: TemplateFeatureManifest["sync"]["rules"];
  renames?: NonNullable<TemplateFeatureManifest["sync"]["renames"]>;
};

async function makeTemplate(
  root: string,
  files: Record<string, string | Buffer>,
  options: TemplateOptions = {}
): Promise<TemplateFeatureManifest> {
  const manifest: TemplateFeatureManifest = {
    schemaVersion: 1,
    features: options.features ?? {},
    requiredPaths: ["pnpm-workspace.yaml"],
    sync: {
      defaultPolicy: "merge",
      rules: options.rules ?? [],
      renames: options.renames ?? [],
    },
  };
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, "template.manifest.json"), `${JSON.stringify(manifest)}\n`);
  const allFiles = {
    "pnpm-workspace.yaml": "packages:\n  - apps/**\ncatalog: {}\ncatalogs:\n  m5kdev: {}\n",
    ...files,
  };
  for (const [relativePath, content] of Object.entries(allFiles)) {
    const target = path.join(root, Buffer.isBuffer(content) ? relativePath : `${relativePath}.tpl`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  return manifest;
}

async function baselineRepo(
  tempRoot: string,
  files: Record<string, string | Buffer>,
  options: TemplateOptions & { enabledFeatures?: string[] } = {}
): Promise<{ baseRoot: string; repoRoot: string; state: ManagedState }> {
  const baseRoot = path.join(tempRoot, "base");
  const repoRoot = path.join(tempRoot, "repo");
  const manifest = await makeTemplate(baseRoot, files, options);
  const enabledFeatures = new Set(options.enabledFeatures ?? []);
  const excludePrefixes = getExcludedFeaturePaths(manifest, enabledFeatures);
  const rendered = await collectTemplateFiles(baseRoot, context, {
    enabledFeatures,
    excludePrefixes,
  });
  await fs.mkdir(repoRoot, { recursive: true });
  await copyTemplateDirectory(baseRoot, repoRoot, context, { enabledFeatures, excludePrefixes });
  return {
    baseRoot,
    repoRoot,
    state: createManagedState({
      templateVersion: "0.31.0",
      enabledFeatures,
      context,
      renderedFiles: rendered,
      manifest,
    }),
  };
}

function provider(root: string): BaseTemplateProvider {
  return { getTemplateRoot: async () => ({ root, cleanup: async () => undefined }) };
}

describe("three-way template reconciliation", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-reconcile-"));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("handles unchanged, local-only, and target-only files", async () => {
    const fixture = await baselineRepo(tempRoot, {
      "unchanged.txt": "same\n",
      "local.txt": "base\n",
      "target.txt": "base\n",
    });
    await fs.writeFile(path.join(fixture.repoRoot, "local.txt"), "local\n");
    const targetRoot = path.join(tempRoot, "target");
    await makeTemplate(targetRoot, {
      "unchanged.txt": "same\n",
      "local.txt": "base\n",
      "target.txt": "target\n",
    });

    const result = await reconcileTemplates({
      repoRoot: fixture.repoRoot,
      state: fixture.state,
      targetTemplateRoot: targetRoot,
      targetVersion: "0.32.0",
      baseProvider: provider(fixture.baseRoot),
    });
    expect(result.changes.conflicts).toEqual([]);
    expect(result.changes.changes.has("unchanged.txt")).toBe(false);
    expect(result.changes.changes.has("local.txt")).toBe(false);
    expect(result.changes.changes.get("target.txt")?.content?.toString()).toBe("target\n");
  });

  it("cleanly merges independent edits and reports overlapping edits", async () => {
    const fixture = await baselineRepo(tempRoot, {
      "clean.txt": "one\ntwo\nthree\n",
      "conflict.txt": "value = base\n",
    });
    await fs.writeFile(path.join(fixture.repoRoot, "clean.txt"), "one-local\ntwo\nthree\n");
    await fs.writeFile(path.join(fixture.repoRoot, "conflict.txt"), "value = local\n");
    const targetRoot = path.join(tempRoot, "target");
    await makeTemplate(targetRoot, {
      "clean.txt": "one\ntwo\nthree-target\n",
      "conflict.txt": "value = target\n",
    });

    const result = await reconcileTemplates({
      repoRoot: fixture.repoRoot,
      state: fixture.state,
      targetTemplateRoot: targetRoot,
      targetVersion: "0.32.0",
      baseProvider: provider(fixture.baseRoot),
    });
    expect(result.changes.changes.get("clean.txt")?.content?.toString()).toContain("one-local");
    expect(result.changes.changes.get("clean.txt")?.content?.toString()).toContain("three-target");
    expect(result.changes.conflicts).toContainEqual({
      path: "conflict.txt",
      reason: "Three-way merge produced conflicts.",
    });
  });

  it("handles additions, deletions, binary divergence, and explicit renames", async () => {
    const fixture = await baselineRepo(tempRoot, {
      "delete.txt": "remove me\n",
      "old-name.txt": "rename me\n",
      "asset.bin": Buffer.from([1, 2, 3]),
      "replace.bin": Buffer.from([4, 5, 6]),
    });
    await fs.writeFile(path.join(fixture.repoRoot, "asset.bin"), Buffer.from([1, 2, 4]));
    const targetRoot = path.join(tempRoot, "target");
    await makeTemplate(
      targetRoot,
      {
        "added.txt": "new\n",
        "new-name.txt": "renamed\n",
        "asset.bin": Buffer.from([1, 2, 5]),
        "replace.bin": Buffer.from([4, 5, 7]),
      },
      { renames: [{ from: "old-name.txt", to: "new-name.txt" }] }
    );

    const result = await reconcileTemplates({
      repoRoot: fixture.repoRoot,
      state: fixture.state,
      targetTemplateRoot: targetRoot,
      targetVersion: "0.32.0",
      baseProvider: provider(fixture.baseRoot),
    });
    expect(result.changes.changes.get("added.txt")?.kind).toBe("add");
    expect(result.changes.changes.get("delete.txt")?.kind).toBe("delete");
    expect(result.changes.changes.get("old-name.txt")?.kind).toBe("delete");
    expect(result.changes.changes.get("new-name.txt")?.kind).toBe("add");
    expect(result.changes.conflicts.some(({ path: filePath }) => filePath === "asset.bin")).toBe(
      true
    );
    expect(result.changes.changes.get("replace.bin")?.kind).toBe("modify");
  });

  it("ignores secrets, migration history, and disabled feature paths", async () => {
    const rules = [
      { pattern: "**/.env", policy: "ignore" as const },
      { pattern: "**/drizzle/*.sql", policy: "ignore" as const },
      { pattern: "**/drizzle/meta/**", policy: "ignore" as const },
    ];
    const features = { webapp: { paths: ["apps/webapp/"] } };
    const fixture = await baselineRepo(
      tempRoot,
      {
        "apps/shared/.env": "SECRET=base\n",
        "apps/server/drizzle/0001.sql": "base sql\n",
        "apps/server/drizzle/meta/journal.json": "base metadata\n",
        "apps/webapp/page.txt": "base page\n",
      },
      { rules, features, enabledFeatures: [] }
    );
    await fs.writeFile(path.join(fixture.repoRoot, "apps/shared/.env"), "SECRET=local\n");
    const targetRoot = path.join(tempRoot, "target");
    await makeTemplate(
      targetRoot,
      {
        "apps/shared/.env": "SECRET=target\n",
        "apps/server/drizzle/0001.sql": "target sql\n",
        "apps/server/drizzle/meta/journal.json": "target metadata\n",
        "apps/webapp/page.txt": "target page\n",
      },
      { rules, features }
    );
    const unavailable: BaseTemplateProvider = {
      getTemplateRoot: async () => {
        throw new Error("must not fetch");
      },
    };

    const result = await reconcileTemplates({
      repoRoot: fixture.repoRoot,
      state: fixture.state,
      targetTemplateRoot: targetRoot,
      targetVersion: "0.32.0",
      baseProvider: unavailable,
    });
    expect(result.changes.conflicts).toEqual([]);
    expect(result.changes.changes.has("apps/shared/.env")).toBe(false);
    expect(result.changes.changes.has("apps/server/drizzle/0001.sql")).toBe(false);
    expect(result.changes.changes.has("apps/server/drizzle/meta/journal.json")).toBe(false);
    expect(result.changes.changes.has("apps/webapp/page.txt")).toBe(false);
  });

  it("adds ensured Database config and deletes unmodified drizzle ops files", async () => {
    const rules = [
      { pattern: "apps/server/db.ts", policy: "ensure" as const },
      { pattern: "apps/server/db.e2e.ts", policy: "ensure" as const },
      { pattern: "apps/server/drizzle.config.ts", policy: "ensure" as const },
    ];
    const features = { "test-harness": { paths: ["apps/server/db.e2e.ts"] } };
    const fixture = await baselineRepo(
      tempRoot,
      {
        "apps/server/drizzle/reset.ts": "old reset\n",
        "apps/server/drizzle/sync.ts": "old sync\n",
        "apps/server/drizzle.config.ts": "old kit\n",
      },
      { rules, features, enabledFeatures: ["test-harness"] }
    );
    const targetRoot = path.join(tempRoot, "target");
    await makeTemplate(
      targetRoot,
      {
        "apps/server/db.ts": "runDb config\n",
        "apps/server/db.e2e.ts": "e2e seed\n",
        "apps/server/drizzle.config.ts": "helper kit\n",
      },
      { rules, features }
    );

    const result = await reconcileTemplates({
      repoRoot: fixture.repoRoot,
      state: fixture.state,
      targetTemplateRoot: targetRoot,
      targetVersion: "0.34.0",
      baseProvider: provider(fixture.baseRoot),
    });

    expect(result.changes.conflicts).toEqual([]);
    expect(result.changes.changes.get("apps/server/db.ts")?.kind).toBe("add");
    expect(result.changes.changes.get("apps/server/db.e2e.ts")?.kind).toBe("add");
    expect(result.changes.changes.get("apps/server/drizzle.config.ts")?.kind).toBe("modify");
    expect(result.changes.changes.get("apps/server/drizzle/reset.ts")?.kind).toBe("delete");
    expect(result.changes.changes.get("apps/server/drizzle/sync.ts")?.kind).toBe("delete");
  });

  it("conflicts when a customized drizzle ops file is removed from the template", async () => {
    const fixture = await baselineRepo(tempRoot, {
      "apps/server/drizzle/reset.ts": "old reset\n",
    });
    await fs.writeFile(
      path.join(fixture.repoRoot, "apps/server/drizzle/reset.ts"),
      "custom reset\n"
    );
    const targetRoot = path.join(tempRoot, "target");
    await makeTemplate(targetRoot, { "apps/server/db.ts": "runDb config\n" });

    const result = await reconcileTemplates({
      repoRoot: fixture.repoRoot,
      state: fixture.state,
      targetTemplateRoot: targetRoot,
      targetVersion: "0.34.0",
      baseProvider: provider(fixture.baseRoot),
    });

    expect(result.changes.conflicts).toContainEqual({
      path: "apps/server/drizzle/reset.ts",
      reason: "The template removed a locally customized path.",
    });
  });

  it("omits e2e Database config when the test-harness feature is disabled", async () => {
    const features = { "test-harness": { paths: ["apps/server/db.e2e.ts"] } };
    const fixture = await baselineRepo(
      tempRoot,
      {
        "apps/server/db.ts": "runDb config\n",
        "apps/server/db.e2e.ts": "e2e seed\n",
      },
      { features, enabledFeatures: [] }
    );

    expect(await fs.readFile(path.join(fixture.repoRoot, "apps/server/db.ts"), "utf8")).toBe(
      "runDb config\n"
    );
    await expect(
      fs.access(path.join(fixture.repoRoot, "apps/server/db.e2e.ts"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports unavailable and corrupt historical artifacts without writes", async () => {
    const fixture = await baselineRepo(tempRoot, { "merge.txt": "base\n" });
    await fs.writeFile(path.join(fixture.repoRoot, "merge.txt"), "local\n");
    const targetRoot = path.join(tempRoot, "target");
    await makeTemplate(targetRoot, { "merge.txt": "target\n" });
    const unavailable = await reconcileTemplates({
      repoRoot: fixture.repoRoot,
      state: fixture.state,
      targetTemplateRoot: targetRoot,
      targetVersion: "0.32.0",
      baseProvider: {
        getTemplateRoot: async () => {
          throw new Error("not published");
        },
      },
    });
    expect(unavailable.changes.conflicts[0]?.reason).toContain("not published");

    const corruptRoot = path.join(tempRoot, "corrupt");
    await makeTemplate(corruptRoot, { "merge.txt": "wrong base\n" });
    const corrupt = await reconcileTemplates({
      repoRoot: fixture.repoRoot,
      state: fixture.state,
      targetTemplateRoot: targetRoot,
      targetVersion: "0.32.0",
      baseProvider: provider(corruptRoot),
    });
    expect(corrupt.changes.conflicts[0]?.reason).toContain(
      "does not match the stored baseline hash"
    );
  });

  it("rejects manifest paths that escape the repository", async () => {
    const fixture = await baselineRepo(tempRoot, { "safe.txt": "base\n" });
    const targetRoot = path.join(tempRoot, "target");
    await makeTemplate(
      targetRoot,
      { "target.txt": "target\n" },
      {
        renames: [{ from: "../escape.txt", to: "target.txt" }],
      }
    );
    await expect(
      reconcileTemplates({
        repoRoot: fixture.repoRoot,
        state: fixture.state,
        targetTemplateRoot: targetRoot,
        targetVersion: "0.32.0",
        baseProvider: provider(fixture.baseRoot),
      })
    ).rejects.toThrow("escapes the repository");
  });

  it("rejects managed files beneath a symlinked directory", async () => {
    const fixture = await baselineRepo(tempRoot, { "nested/file.txt": "base\n" });
    const outside = path.join(tempRoot, "outside");
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "file.txt"), "outside\n");
    await fs.rm(path.join(fixture.repoRoot, "nested"), { recursive: true });
    await fs.symlink(outside, path.join(fixture.repoRoot, "nested"), "dir");
    const targetRoot = path.join(tempRoot, "target");
    await makeTemplate(targetRoot, { "nested/file.txt": "target\n" });

    const result = await reconcileTemplates({
      repoRoot: fixture.repoRoot,
      state: fixture.state,
      targetTemplateRoot: targetRoot,
      targetVersion: "0.32.0",
      baseProvider: provider(fixture.baseRoot),
    });
    expect(result.changes.conflicts).toContainEqual({
      path: "nested/file.txt",
      reason: "Managed path contains symbolic link nested.",
    });
  });

  it("renders Dockerfile, dockerignore, and fly.toml as text templates", async () => {
    const root = path.join(tempRoot, "docker-tpl");
    await makeTemplate(root, {
      Dockerfile: "FROM node:24-slim\nRUN pnpm --filter={{PACKAGE_SCOPE}}/server build\n",
      ".dockerignore": "# {{APP_SLUG}}\nnode_modules\n",
      "apps/shared/fly.toml": 'app = "{{APP_SLUG}}-app"\n',
    });
    const files = await collectTemplateFiles(root, context);
    const byPath = Object.fromEntries(
      files.map((file) => [file.relativePath, file.content.toString("utf8")])
    );
    expect(byPath.Dockerfile).toContain("@fixture/server");
    expect(byPath.Dockerfile).not.toContain("{{PACKAGE_SCOPE}}");
    expect(byPath[".dockerignore"]).toContain("# fixture");
    expect(byPath["apps/shared/fly.toml"]).toBe('app = "fixture-app"\n');
  });

  it("ignores fly.toml and .env.production on update", async () => {
    const rules = [
      { pattern: "**/.env.production", policy: "ignore" as const },
      { pattern: "**/fly.toml", policy: "ignore" as const },
    ];
    const fixture = await baselineRepo(
      tempRoot,
      {
        "apps/shared/fly.toml": 'app = "fixture-app"\nprimary_region = "iad"\n',
        "apps/shared/.env.production": "SECRET=base\n",
        "apps/shared/.env.production.example": "SECRET=\n",
      },
      { rules }
    );
    await fs.writeFile(
      path.join(fixture.repoRoot, "apps/shared/fly.toml"),
      'app = "custom-app"\nprimary_region = "fra"\n'
    );
    await fs.writeFile(
      path.join(fixture.repoRoot, "apps/shared/.env.production"),
      "SECRET=local\n"
    );
    const targetRoot = path.join(tempRoot, "target");
    await makeTemplate(
      targetRoot,
      {
        "apps/shared/fly.toml": 'app = "fixture-app"\nprimary_region = "ord"\n',
        "apps/shared/.env.production": "SECRET=target\n",
        "apps/shared/.env.production.example": "SECRET=updated\n",
      },
      { rules }
    );

    const result = await reconcileTemplates({
      repoRoot: fixture.repoRoot,
      state: fixture.state,
      targetTemplateRoot: targetRoot,
      targetVersion: "0.32.0",
      baseProvider: provider(fixture.baseRoot),
    });
    expect(result.changes.conflicts).toEqual([]);
    expect(result.changes.changes.has("apps/shared/fly.toml")).toBe(false);
    expect(result.changes.changes.has("apps/shared/.env.production")).toBe(false);
    expect(result.changes.changes.get("apps/shared/.env.production.example")?.kind).toBe("modify");
  });

  it("strips hash-comment feature marker blocks for disabled features", async () => {
    const root = path.join(tempRoot, "marker-tpl");
    await makeTemplate(root, {
      Dockerfile: [
        "FROM node:24-slim",
        "# m5k:webapp:start",
        "RUN pnpm --filter=webapp build",
        "# m5k:webapp:end",
        "CMD node index.js",
        "",
      ].join("\n"),
    });
    const files = await collectTemplateFiles(root, context, {
      enabledFeatures: new Set(),
    });
    const docker = files
      .find((file) => file.relativePath === "Dockerfile")
      ?.content.toString("utf8");
    expect(docker).toContain("FROM node:24-slim");
    expect(docker).toContain("CMD node index.js");
    expect(docker).not.toContain("webapp build");
    expect(docker).not.toContain("m5k:webapp");
  });

  it("strips hash-comment feature marker blocks with CRLF line endings", async () => {
    const root = path.join(tempRoot, "marker-crlf-tpl");
    await makeTemplate(root, {
      Dockerfile: [
        "FROM node:24-slim",
        "# m5k:webapp:start",
        "RUN pnpm --filter=webapp build",
        "# m5k:webapp:end",
        "CMD node index.js",
        "",
      ].join("\r\n"),
    });
    const files = await collectTemplateFiles(root, context, {
      enabledFeatures: new Set(),
    });
    const docker = files
      .find((file) => file.relativePath === "Dockerfile")
      ?.content.toString("utf8");
    expect(docker).toContain("FROM node:24-slim");
    expect(docker).not.toContain("webapp build");
    expect(docker).not.toContain("m5k:webapp");
    expect(docker).not.toContain("\r");
  });
});
