import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import {
  assertCatalogKeys,
  buildConsumerCatalog,
  collectConsumerDependencyNames,
  mergeManagedCatalog,
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
    expect(catalog["@libsql/client"]).toBe("0.17.4");
    expect(catalog["@types/react"]).toBe("19.2.17");
    expect(catalog["drizzle-kit"]).toBe("0.31.10");
    expect(catalog["drizzle-orm"]).toBe("0.45.2");

    const variantManifests = ["shared", "server", "email", "webapp", "expo", "e2e"]
      .map((name) => path.join(REPO_ROOT, "apps/starter", name, "package.json"))
      .filter((file) => fs.existsSync(file));
    for (const dependency of collectConsumerDependencyNames(variantManifests)) {
      expect(catalog).toHaveProperty(dependency);
    }
  });

  it("merges managed values while preserving app-owned entries", () => {
    const source = [
      "packages:",
      "  - apps/**",
      "catalog:",
      "  managed: 1.0.0",
      "  customized: 9.9.9",
      "  removed-custom: 8.8.8",
      "  app-owned: 2.0.0",
      "",
    ].join("\n");
    const merged = mergeManagedCatalog({
      source,
      base: { managed: "1.0.0", customized: "1.0.0", "removed-custom": "1.0.0", obsolete: "1.0.0" },
      target: { managed: "1.1.0", customized: "1.1.0", added: "3.0.0" },
    });
    const catalog = (parse(merged.source) as { catalog: Record<string, string> }).catalog;
    expect(catalog.managed).toBe("1.1.0");
    expect(catalog.added).toBe("3.0.0");
    expect(catalog["app-owned"]).toBe("2.0.0");
    expect(catalog).not.toHaveProperty("obsolete");
    expect(merged.conflicts.map((conflict) => conflict.name)).toEqual([
      "customized",
      "removed-custom",
    ]);
  });

  it("rejects missing and obsolete generated entries", () => {
    expect(() => assertCatalogKeys({ used: "1.0.0", stale: "1.0.0" }, ["used", "missing"])).toThrow(
      "missing: missing; obsolete: stale"
    );
  });
});
