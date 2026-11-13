import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import semver from "semver";
import { readDefaultCatalog, walkPackageJsonFiles } from "./catalog";
import { findRepositorySymlink } from "./changes";
import { inspectConfiguration } from "./configuration";
import type { Diagnostic, VerificationCheck } from "./diagnostics";
import type { ManagedState } from "./state";

interface PackageManifest {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  engines?: { node?: string };
  bin?: string | Record<string, string>;
}

async function accessible(file: string, mode = constants.F_OK): Promise<boolean> {
  return fs.access(file, mode).then(
    () => true,
    () => false
  );
}

function ancestorDirectories(directory: string, repoRoot: string): string[] {
  const directories: string[] = [];
  for (let current = directory; ; current = path.dirname(current)) {
    directories.push(current);
    if (current === repoRoot || path.dirname(current) === current) break;
  }
  return directories;
}

async function installedManifest(directories: string[], name: string): Promise<string | undefined> {
  for (const directory of directories) {
    const candidate = path.join(directory, "node_modules", name, "package.json");
    if (await accessible(candidate)) return candidate;
  }
  return undefined;
}

export async function inspectReadiness(options: {
  repoRoot: string;
  state: ManagedState;
  checkInstallation: boolean;
}): Promise<{ diagnostics: Diagnostic[]; verification: VerificationCheck[] }> {
  const repoRoot = path.resolve(options.repoRoot);
  const diagnostics: Diagnostic[] = [];
  const verification: VerificationCheck[] = [];
  const manifests = new Map<string, PackageManifest>();
  const packageFiles = [path.join(repoRoot, "package.json")];
  const appsRoot = path.join(repoRoot, "apps");
  if (await accessible(appsRoot)) packageFiles.push(...walkPackageJsonFiles(appsRoot));
  let defaultCatalog: Record<string, string> = {};
  try {
    defaultCatalog = readDefaultCatalog(
      await fs.readFile(path.join(repoRoot, "pnpm-workspace.yaml"), "utf8")
    );
  } catch {
    // Source diagnostics explain invalid/missing catalogs.
  }

  for (const packageFile of packageFiles) {
    const relativePath = path.relative(repoRoot, packageFile);
    if (await findRepositorySymlink(repoRoot, relativePath)) continue;
    let manifest: PackageManifest;
    try {
      manifest = JSON.parse(await fs.readFile(packageFile, "utf8"));
      if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
        throw new Error("Invalid manifest");
    } catch {
      diagnostics.push({
        code: "PACKAGE_JSON_UNREADABLE",
        severity: "error",
        path: relativePath,
        message: "Cannot read the package manifest.",
      });
      continue;
    }
    manifests.set(relativePath, manifest);
    const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
    if (Object.keys(dependencies).length === 0) continue;
    if (!options.checkInstallation) {
      verification.push({
        id: `dependencies:${relativePath}`,
        status: "configured-but-untested",
        path: relativePath,
        message:
          "Dependency declarations inspected; installation was not checked during enrollment.",
        suggestion: "Run pnpm install, then doctor --full.",
      });
      continue;
    }
    const directories = ancestorDirectories(path.dirname(packageFile), repoRoot);
    const missing: string[] = [];
    const before = diagnostics.length;
    let uncheckedVersion = false;
    for (const [name, specifier] of Object.entries(dependencies)) {
      if (typeof specifier !== "string") {
        diagnostics.push({
          code: "PACKAGE_DEPENDENCY_INVALID",
          severity: "error",
          path: relativePath,
          message: `The declaration for ${name} must be a string.`,
        });
        continue;
      }
      const installedPath = await installedManifest(directories, name);
      if (!installedPath) {
        missing.push(name);
        continue;
      }
      let installed: PackageManifest;
      try {
        installed = JSON.parse(await fs.readFile(installedPath, "utf8"));
        if (!installed || typeof installed !== "object" || Array.isArray(installed))
          throw new Error("Invalid metadata");
      } catch {
        diagnostics.push({
          code: "INSTALLED_PACKAGE_INVALID",
          severity: "error",
          path: relativePath,
          message: `Installed metadata for ${name} is unreadable.`,
          suggestion: "Reinstall dependencies.",
        });
        continue;
      }
      const declared = specifier === "catalog:" ? defaultCatalog[name] : specifier;
      const ranges = [...new Set([options.state.catalog[name], declared])].filter(
        (range): range is string => typeof range === "string" && Boolean(semver.validRange(range))
      );
      for (const expected of ranges) {
        if (
          typeof installed.version !== "string" ||
          !semver.valid(installed.version) ||
          !semver.satisfies(installed.version, expected)
        ) {
          diagnostics.push({
            code: "INSTALLED_VERSION_MISMATCH",
            severity: "error",
            path: relativePath,
            message: `${name} has installed version ${typeof installed.version === "string" ? installed.version : "unknown"}; expected ${expected}.`,
            suggestion: "Reconcile declarations and run pnpm install.",
          });
        }
      }
      if (!ranges.length && !specifier.startsWith("workspace:")) uncheckedVersion = true;

      const bins =
        typeof installed.bin === "string"
          ? { [name.split("/").at(-1) ?? name]: installed.bin }
          : (installed.bin ?? {});
      for (const [bin, target] of Object.entries(bins)) {
        if (typeof target !== "string") {
          diagnostics.push({
            code: "INSTALLED_PACKAGE_INVALID",
            severity: "error",
            path: relativePath,
            message: `${name} has an invalid executable declaration.`,
          });
          continue;
        }
        const targetPath = path.resolve(path.dirname(installedPath), target);
        let shim = false;
        for (const directory of directories) {
          if (
            await accessible(
              path.join(
                directory,
                "node_modules/.bin",
                process.platform === "win32" ? `${bin}.cmd` : bin
              ),
              constants.X_OK
            )
          ) {
            shim = true;
            break;
          }
        }
        if (!(await accessible(targetPath)) || !shim) {
          diagnostics.push({
            code: "EXECUTABLE_MISSING",
            severity: "error",
            path: relativePath,
            message: `${name} provides ${bin}, but its executable target or local command shim is missing.`,
            suggestion:
              "Reinstall dependencies and build linked packages that provide executables.",
          });
        }
      }
    }
    if (missing.length)
      diagnostics.push({
        code: "DEPENDENCY_MISSING",
        severity: "error",
        path: relativePath,
        message: `Missing installed dependencies: ${missing.join(", ")}.`,
        suggestion: "Run pnpm install.",
      });
    verification.push({
      id: `dependencies:${relativePath}`,
      path: relativePath,
      status:
        diagnostics.length > before
          ? "blocked"
          : uncheckedVersion
            ? "configured-but-untested"
            : "verified",
      message:
        diagnostics.length > before
          ? "Installed dependency or executable checks failed."
          : "Direct dependency versions and package executables inspected.",
      evidence: [
        `Inspected ${Object.keys(dependencies).length} direct dependency declarations; no application code was executed.`,
      ],
      suggestion: uncheckedVersion
        ? "Verify non-SemVer dependency sources against the intended revision."
        : undefined,
    });
  }
  if (options.checkInstallation) {
    const missing: string[] = [];
    for (const executable of ["pnpm", "git"]) {
      let found = false;
      for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
        if (
          await accessible(
            path.join(directory, process.platform === "win32" ? `${executable}.cmd` : executable),
            constants.X_OK
          )
        ) {
          found = true;
          break;
        }
      }
      if (!found) missing.push(executable);
    }
    if (missing.length)
      diagnostics.push({
        code: "EXECUTABLE_MISSING",
        severity: "error",
        message: `Required commands are unavailable: ${missing.join(", ")}.`,
        suggestion: "Install the commands and make them available on PATH.",
      });
    verification.push({
      id: "executables",
      status: missing.length ? "blocked" : "verified",
      message: "Checked pnpm and git executable availability on PATH.",
    });
  }
  const configuration = await inspectConfiguration({ repoRoot, state: options.state, manifests });
  diagnostics.push(...configuration.diagnostics);
  verification.push(...configuration.verification);
  return { diagnostics, verification };
}
