import fs from "node:fs";
import path from "node:path";
import { parse, parseDocument, stringify } from "yaml";

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

export const MANAGED_CATALOG_NAME = "m5kdev";
export const MANAGED_CATALOG_SPECIFIER = `catalog:${MANAGED_CATALOG_NAME}`;

export type ConsumerCatalog = Record<string, string>;

interface WorkspaceCatalogFile {
  catalog?: Record<string, string | number>;
  catalogs?: Record<string, Record<string, string | number> | undefined>;
}

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

function asCatalog(value: Record<string, string | number> | undefined): ConsumerCatalog {
  return Object.fromEntries(
    Object.entries(value ?? {}).map(([name, version]) => [name, String(version)])
  );
}

export function collectConsumerDependencyNamesFromManifests(
  manifests: readonly Record<string, unknown>[]
): string[] {
  const names = new Set<string>();

  for (const manifest of manifests) {
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

export function collectConsumerDependencyNames(packageFiles: readonly string[]): string[] {
  return collectConsumerDependencyNamesFromManifests(packageFiles.map(readJson));
}

export interface CatalogProtocolDependency {
  name: string;
  specifier: string;
}

export function collectCatalogProtocolDependenciesFromManifests(
  manifests: readonly Record<string, unknown>[]
): CatalogProtocolDependency[] {
  const dependencies: CatalogProtocolDependency[] = [];
  for (const manifest of manifests) {
    for (const field of DEPENDENCY_FIELDS) {
      for (const [name, specifier] of Object.entries(
        (manifest[field] as Record<string, string> | undefined) ?? {}
      )) {
        if (specifier.startsWith("catalog:")) dependencies.push({ name, specifier });
      }
    }
  }
  return dependencies;
}

export function collectCatalogProtocolDependencies(
  packageFiles: readonly string[]
): CatalogProtocolDependency[] {
  return collectCatalogProtocolDependenciesFromManifests(packageFiles.map(readJson));
}

/** Optional `@m5kdev/module-*` pins stay in the Managed catalog even when Starter does not depend on them. */
export function collectOptionalBackendModulePins(repoRoot: string): ConsumerCatalog {
  const packagesDir = path.join(repoRoot, "packages");
  const pins: ConsumerCatalog = {};
  if (!fs.existsSync(packagesDir)) return pins;

  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("module-")) continue;
    const manifestPath = path.join(packagesDir, entry.name, "package.json");
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = readJson(manifestPath);
    const name = manifest.name;
    const version = manifest.version;
    if (typeof name !== "string" || typeof version !== "string") continue;
    if (!name.startsWith("@m5kdev/module-")) continue;
    pins[name] = version;
  }

  return pins;
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

  Object.assign(catalog, collectOptionalBackendModulePins(options.repoRoot));

  if (missing.length > 0) {
    throw new Error(`Missing consumer catalog versions for: ${missing.join(", ")}`);
  }

  return sortedCatalog(catalog);
}

export function sortedCatalog(catalog: ConsumerCatalog): ConsumerCatalog {
  return Object.fromEntries(
    Object.entries(catalog).sort(([left], [right]) => left.localeCompare(right))
  );
}

export function renderConsumerWorkspace(source: string, catalog: ConsumerCatalog): string {
  const workspace = parse(source) as Record<string, unknown>;
  const catalogs =
    workspace.catalogs && typeof workspace.catalogs === "object"
      ? { ...(workspace.catalogs as Record<string, unknown>) }
      : {};
  catalogs[MANAGED_CATALOG_NAME] = sortedCatalog(catalog);
  workspace.catalogs = catalogs;
  if (workspace.catalog === undefined) workspace.catalog = {};
  return stringify(workspace, { lineWidth: 0 });
}

export function readDefaultCatalog(source: string): ConsumerCatalog {
  const workspace = parse(source) as WorkspaceCatalogFile;
  return asCatalog(workspace.catalog);
}

export function readCatalog(source: string): ConsumerCatalog {
  const workspace = parse(source) as WorkspaceCatalogFile;
  const named = workspace.catalogs?.[MANAGED_CATALOG_NAME];
  if (named !== undefined) return asCatalog(named);
  return asCatalog(workspace.catalog);
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
  const workspace = parse(options.source) as WorkspaceCatalogFile;
  const namedPresent = workspace.catalogs?.[MANAGED_CATALOG_NAME] !== undefined;
  const named = asCatalog(workspace.catalogs?.[MANAGED_CATALOG_NAME]);
  const fallback = asCatalog(workspace.catalog);
  const conflicts: CatalogMergeConflict[] = [];
  const names = new Set([...Object.keys(options.base), ...Object.keys(options.target)]);
  const managedPath = ["catalogs", MANAGED_CATALOG_NAME] as const;

  if (document.getIn([...managedPath]) === undefined) {
    if (document.get("catalogs") === undefined) {
      document.set("catalogs", document.createNode({ [MANAGED_CATALOG_NAME]: {} }));
    } else {
      document.setIn([...managedPath], document.createNode({}));
    }
  }

  for (const name of [...names].sort((left, right) => left.localeCompare(right))) {
    const base = options.base[name];
    const current = (namedPresent ? named[name] : undefined) ?? fallback[name];
    const target = options.target[name];

    if (base === undefined) {
      if (current === undefined) {
        document.setIn([...managedPath, name], target);
        document.deleteIn(["catalog", name]);
      } else if (current !== target) conflicts.push({ name, local: current, target });
      continue;
    }
    if (target === undefined) {
      if (current === base) {
        document.deleteIn([...managedPath, name]);
        document.deleteIn(["catalog", name]);
      } else if (current !== undefined) conflicts.push({ name, base, local: current });
      continue;
    }
    if (current === base) {
      document.setIn([...managedPath, name], target);
      document.deleteIn(["catalog", name]);
    } else if (current !== target && target !== base) {
      conflicts.push({ name, base, local: current, target });
    }
  }

  const merged = document.toString({ lineWidth: 0 });
  return { source: merged, changed: merged !== options.source, conflicts };
}
