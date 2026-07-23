import fs from "node:fs";
import path from "node:path";
import { parse, parseDocument, stringify } from "yaml";

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

export type ConsumerCatalog = Record<string, string>;

export function walkPackageJsonFiles(directory: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkPackageJsonFiles(entryPath, out);
    } else if (entry.isFile() && entry.name === "package.json") {
      out.push(entryPath);
    }
  }
  return out;
}

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

export function collectConsumerDependencyNames(packageFiles: readonly string[]): string[] {
  const names = new Set<string>();

  for (const filePath of packageFiles) {
    const manifest = readJson(filePath);
    for (const field of DEPENDENCY_FIELDS) {
      const dependencies = manifest[field] as Record<string, string> | undefined;
      for (const [name, specifier] of Object.entries(dependencies ?? {})) {
        if (
          specifier.startsWith("catalog:") ||
          (name.startsWith("@m5kdev/") && specifier.startsWith("workspace:"))
        ) {
          names.add(name);
        }
      }
    }
  }

  return [...names].sort((left, right) => left.localeCompare(right));
}

export function buildConsumerCatalog(options: {
  repoRoot: string;
  starterDirectory: string;
  rootTemplatesDirectory: string;
}): ConsumerCatalog {
  const workspacePath = path.join(options.repoRoot, "pnpm-workspace.yaml");
  const workspace = parse(fs.readFileSync(workspacePath, "utf8")) as {
    catalog?: Record<string, string | number>;
  };
  const sourceCatalog = workspace.catalog ?? {};
  const packageFiles = [
    ...walkPackageJsonFiles(options.starterDirectory),
    path.join(options.rootTemplatesDirectory, "package.json.tpl"),
  ];
  const names = collectConsumerDependencyNames(packageFiles);
  const catalog: ConsumerCatalog = {};
  const missing: string[] = [];

  for (const name of names) {
    if (name.startsWith("@m5kdev/")) {
      const packageName = name.slice("@m5kdev/".length);
      const packagePath = path.join(options.repoRoot, "packages", packageName, "package.json");
      if (!fs.existsSync(packagePath)) {
        missing.push(name);
        continue;
      }
      const packageManifest = readJson(packagePath);
      if (typeof packageManifest.version !== "string") {
        missing.push(name);
        continue;
      }
      catalog[name] = packageManifest.version;
      continue;
    }

    const version = sourceCatalog[name];
    if (version === undefined) {
      missing.push(name);
      continue;
    }
    catalog[name] = String(version);
  }

  if (missing.length > 0) {
    throw new Error(`Missing consumer catalog versions for: ${missing.join(", ")}`);
  }

  return catalog;
}

export function renderConsumerWorkspace(source: string, catalog: ConsumerCatalog): string {
  const workspace = parse(source) as Record<string, unknown>;
  workspace.catalog = Object.fromEntries(
    Object.entries(catalog).sort(([left], [right]) => left.localeCompare(right))
  );
  return stringify(workspace, { lineWidth: 0 });
}

export function readCatalog(source: string): ConsumerCatalog {
  const workspace = parse(source) as { catalog?: Record<string, string | number> };
  return Object.fromEntries(
    Object.entries(workspace.catalog ?? {}).map(([name, version]) => [name, String(version)])
  );
}

export function assertCatalogKeys(
  catalog: ConsumerCatalog,
  expectedNames: readonly string[],
  label = "consumer catalog"
): void {
  const expected = new Set(expectedNames);
  const missing = expectedNames.filter((name) => !(name in catalog));
  const obsolete = Object.keys(catalog).filter((name) => !expected.has(name));
  if (missing.length > 0 || obsolete.length > 0) {
    const details = [
      missing.length > 0 ? `missing: ${missing.join(", ")}` : undefined,
      obsolete.length > 0 ? `obsolete: ${obsolete.join(", ")}` : undefined,
    ].filter(Boolean);
    throw new Error(`Invalid ${label} (${details.join("; ")})`);
  }
}

export interface CatalogMergeConflict {
  name: string;
  base?: string;
  local?: string;
  target?: string;
}

export function mergeManagedCatalog(options: {
  source: string;
  base: ConsumerCatalog;
  target: ConsumerCatalog;
}): { source: string; changed: boolean; conflicts: CatalogMergeConflict[] } {
  const document = parseDocument(options.source);
  const local = readCatalog(options.source);
  const conflicts: CatalogMergeConflict[] = [];
  const names = new Set([...Object.keys(options.base), ...Object.keys(options.target)]);

  for (const name of [...names].sort((left, right) => left.localeCompare(right))) {
    const base = options.base[name];
    const current = local[name];
    const target = options.target[name];

    if (base === undefined) {
      if (current === undefined) document.setIn(["catalog", name], target);
      else if (current !== target) conflicts.push({ name, local: current, target });
      continue;
    }
    if (target === undefined) {
      if (current === base) document.deleteIn(["catalog", name]);
      else if (current !== undefined) conflicts.push({ name, base, local: current });
      continue;
    }
    if (current === base) document.setIn(["catalog", name], target);
    else if (current !== target && target !== base) {
      conflicts.push({ name, base, local: current, target });
    }
  }

  const merged = document.toString({ lineWidth: 0 });
  return { source: merged, changed: merged !== options.source, conflicts };
}
