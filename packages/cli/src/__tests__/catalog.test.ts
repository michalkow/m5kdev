import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import {
  assertCatalogKeys,
  buildConsumerCatalog,
  collectConsumerDependencyNames,
  MANAGED_CATALOG_NAME,
  mergeManagedCatalog,
  readCatalog,
  renderConsumerWorkspace,
  walkPackageJsonFiles,
} from "../catalog";

const REPO_ROOT = path.resolve(__dirname, "../../../..");

describe("consumer catalog", () => {
  it("derives a sorted feature superset from starter manifests and authoritative versions", () => {
    const catalog = buildConsumerCatalog({
      repoRoot: REPO_ROOT,
      starterDirectory: path.join(REPO_ROOT, "apps/starter"),
      rootTemplatesDirectory: path.join(REPO_ROOT, "packages/cli/root-templates"),
    });
    expect(Object.keys(catalog)).toEqual(
      [...Object.keys(catalog)].sort((a, b) => a.localeCompare(b))
    );
    expect(catalog["@m5kdev/backend"]).toBe(
      JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "packages/backend/package.json"), "utf8"))
        .version
    );
    expect(catalog["@m5kdev/frontend"]).toBe(
      JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "packages/frontend/package.json"), "utf8"))
        .version
    );
    expect(catalog["@m5kdev/module-pdf"]).toBe(
      JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "packages/module-pdf/package.json"), "utf8"))
        .version
    );
    expect(catalog["@m5kdev/module-docx"]).toBe(
      JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "packages/module-docx/package.json"), "utf8"))
        .version
    );
    expect(catalog["@m5kdev/module-video"]).toBe(
      JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, "packages/module-video/package.json"), "utf8")
      ).version
    );
    expect(catalog["@m5kdev/module-social"]).toBe(
      JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, "packages/module-social/package.json"), "utf8")
      ).version
    );
    expect(catalog["@m5kdev/module-clay"]).toBe(
      JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "packages/module-clay/package.json"), "utf8"))
        .version
    );
    expect(catalog["@libsql/client"]).toBe("0.17.4");
    expect(catalog["@types/react"]).toBe("19.2.17");
    expect(catalog["drizzle-kit"]).toBe("0.31.10");
    expect(catalog["drizzle-orm"]).toBe("0.45.2");

    const variantManifests = ["shared", "server", "email", "webapp", "expo", "e2e", "landing"]
      .map((name) => path.join(REPO_ROOT, "apps/starter", name, "package.json"))
      .filter((file) => fs.existsSync(file));
    for (const dependency of collectConsumerDependencyNames(variantManifests)) {
      expect(catalog).toHaveProperty(dependency);
    }
  });

  it("renders the consumer catalog into catalogs.m5kdev and keeps an empty default catalog", () => {
    const rendered = renderConsumerWorkspace(
      ["packages:", "  - apps/**", "catalog: {}", "catalogs:", "  m5kdev: {}", ""].join("\n"),
      { "drizzle-orm": "0.45.2", zod: "4.2.1" }
    );
    const workspace = parse(rendered) as {
      catalog: Record<string, string>;
      catalogs: { m5kdev: Record<string, string> };
    };
    expect(workspace.catalog).toEqual({});
    expect(workspace.catalogs[MANAGED_CATALOG_NAME]).toEqual({
      "drizzle-orm": "0.45.2",
      zod: "4.2.1",
    });
    expect(readCatalog(rendered)).toEqual({ "drizzle-orm": "0.45.2", zod: "4.2.1" });
  });

  it("merges managed values while preserving app-owned entries", () => {
    const source = [
      "packages:",
      "  - apps/**",
      "catalog:",
      "  app-owned: 2.0.0",
      "catalogs:",
      "  m5kdev:",
      "    managed: 1.0.0",
      "    customized: 9.9.9",
      "    removed-custom: 8.8.8",
      "",
    ].join("\n");
    const merged = mergeManagedCatalog({
      source,
      base: { managed: "1.0.0", customized: "1.0.0", "removed-custom": "1.0.0", obsolete: "1.0.0" },
      target: { managed: "1.1.0", customized: "1.1.0", added: "3.0.0" },
    });
    const workspace = parse(merged.source) as {
      catalog: Record<string, string>;
      catalogs: { m5kdev: Record<string, string> };
    };
    expect(workspace.catalog["app-owned"]).toBe("2.0.0");
    expect(workspace.catalog).not.toHaveProperty("managed");
    expect(workspace.catalogs[MANAGED_CATALOG_NAME].managed).toBe("1.1.0");
    expect(workspace.catalogs[MANAGED_CATALOG_NAME].added).toBe("3.0.0");
    expect(workspace.catalogs[MANAGED_CATALOG_NAME]).not.toHaveProperty("obsolete");
    expect(merged.conflicts.map((conflict) => conflict.name)).toEqual([
      "customized",
      "removed-custom",
    ]);
  });

  it("moves legacy default-catalog managed keys into catalogs.m5kdev", () => {
    const source = [
      "packages:",
      "  - apps/**",
      "catalog:",
      "  managed: 1.0.0",
      "  app-owned: 2.0.0",
      "",
    ].join("\n");
    const merged = mergeManagedCatalog({
      source,
      base: { managed: "1.0.0" },
      target: { managed: "1.1.0" },
    });
    const workspace = parse(merged.source) as {
      catalog: Record<string, string>;
      catalogs: { m5kdev: Record<string, string> };
    };
    expect(workspace.catalog["app-owned"]).toBe("2.0.0");
    expect(workspace.catalog).not.toHaveProperty("managed");
    expect(workspace.catalogs[MANAGED_CATALOG_NAME].managed).toBe("1.1.0");
  });

  it("rejects missing and obsolete generated entries", () => {
    expect(() => assertCatalogKeys({ used: "1.0.0", stale: "1.0.0" }, ["used", "missing"])).toThrow(
      "missing: missing; obsolete: stale"
    );
  });
});

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

function catalogSpecifierNames(files: readonly string[]): Set<string> {
  const names = new Set<string>();
  for (const file of files) {
    const manifest = readJson(file);
    for (const field of DEPENDENCY_FIELDS) {
      for (const [name, specifier] of Object.entries(
        (manifest[field] as Record<string, string> | undefined) ?? {}
      )) {
        if (specifier.startsWith("catalog:")) names.add(name);
      }
    }
  }
  return names;
}

describe("monorepo catalog hygiene", () => {
  it("has a catalog: reference for every catalog key", () => {
    const catalog = parse(fs.readFileSync(path.join(REPO_ROOT, "pnpm-workspace.yaml"), "utf8")) as {
      catalog?: Record<string, string | number>;
    };
    const keys = Object.keys(catalog.catalog ?? {});
    const referenced = catalogSpecifierNames([
      path.join(REPO_ROOT, "package.json"),
      ...walkPackageJsonFiles(path.join(REPO_ROOT, "apps")),
      ...walkPackageJsonFiles(path.join(REPO_ROOT, "packages")),
    ]);
    expect(keys.filter((name) => !referenced.has(name))).toEqual([]);
  });

  it("does not exact-pin catalogued third-parties in Starter or root templates", () => {
    const catalog = parse(fs.readFileSync(path.join(REPO_ROOT, "pnpm-workspace.yaml"), "utf8")) as {
      catalog?: Record<string, string | number>;
    };
    const catalogued = new Set(Object.keys(catalog.catalog ?? {}));
    const files = [
      ...walkPackageJsonFiles(path.join(REPO_ROOT, "apps/starter")),
      path.join(REPO_ROOT, "packages/cli/root-templates/package.json.tpl"),
    ];
    const pinned: string[] = [];
    for (const file of files) {
      const manifest = readJson(file);
      for (const field of DEPENDENCY_FIELDS) {
        for (const [name, specifier] of Object.entries(
          (manifest[field] as Record<string, string> | undefined) ?? {}
        )) {
          if (!catalogued.has(name)) continue;
          if (specifier.startsWith("catalog:")) continue;
          if (name.startsWith("@m5kdev/") && specifier.startsWith("workspace:")) continue;
          pinned.push(`${path.relative(REPO_ROOT, file)}:${name}=${specifier}`);
        }
      }
    }
    expect(pinned).toEqual([]);
  });
});

const BOUNDARY_PEERS: Record<string, readonly string[]> = {
  "@m5kdev/backend": [
    "@trpc/server",
    "better-auth",
    "drizzle-orm",
    "drizzle-zod",
    "express",
    "neverthrow",
    "react",
    "react-dom",
    "zod",
  ],
  "@m5kdev/commons": ["zod"],
  "@m5kdev/frontend": ["@trpc/client", "@trpc/server", "better-auth", "react", "react-dom", "zod"],
  "@m5kdev/web-ui": ["@heroui/react", "nuqs", "react", "react-dom", "zod"],
  "@m5kdev/module-pdf": ["neverthrow"],
  "@m5kdev/module-docx": ["neverthrow"],
  "@m5kdev/module-video": ["neverthrow"],
  "@m5kdev/module-social": ["neverthrow", "zod"],
  "@m5kdev/module-clay": ["neverthrow", "zod"],
};

describe("boundary library peers", () => {
  it("declares boundary libraries as peers, not nested dependencies", () => {
    const nested: string[] = [];
    const missingPeers: string[] = [];
    for (const [packageName, libraries] of Object.entries(BOUNDARY_PEERS)) {
      const dir = packageName.slice("@m5kdev/".length);
      const manifest = readJson(path.join(REPO_ROOT, "packages", dir, "package.json"));
      const dependencies = (manifest.dependencies as Record<string, string> | undefined) ?? {};
      const peers = (manifest.peerDependencies as Record<string, string> | undefined) ?? {};
      for (const library of libraries) {
        if (library in dependencies) nested.push(`${packageName}:${library}`);
        if (!(library in peers)) missingPeers.push(`${packageName}:${library}`);
      }
    }
    expect({ nested, missingPeers }).toEqual({ nested: [], missingPeers: [] });
  });
});

describe("OpenTelemetry catalog pin", () => {
  it("includes Starter server @opentelemetry/api in the consumer catalog", () => {
    const catalog = buildConsumerCatalog({
      repoRoot: REPO_ROOT,
      starterDirectory: path.join(REPO_ROOT, "apps/starter"),
      rootTemplatesDirectory: path.join(REPO_ROOT, "packages/cli/root-templates"),
    });
    expect(catalog).toHaveProperty("@opentelemetry/api", "1.9.0");
  });
});
