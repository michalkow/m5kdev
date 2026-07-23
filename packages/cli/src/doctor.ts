import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import semver from "semver";
import { collectConsumerDependencyNames, readCatalog, walkPackageJsonFiles } from "./catalog";
import { ChangeSet, findRepositorySymlink } from "./changes";
import { TEMPLATE_NAME } from "./constants";
import { createDiagnosticReport, type Diagnostic, type DiagnosticReport } from "./diagnostics";
import { getPendingMigrations, runMigrationValidators } from "./migrations/registry";
import { getTemplateRoot } from "./paths";
import { getCliVersion, type ManagedState, readManagedState, sha256 } from "./state";
import { loadTemplateManifest } from "./template";

const execFileAsync = promisify(execFile);
const FULL_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

export interface DoctorOptions {
  repoRoot: string;
  full?: boolean;
  state?: ManagedState;
}

async function exists(filePath: string): Promise<boolean> {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

export async function diagnoseManagedRepo(options: DoctorOptions): Promise<DiagnosticReport> {
  const diagnostics: Diagnostic[] = [];
  let state = options.state;
  if (!state) {
    try {
      state = await readManagedState(options.repoRoot);
    } catch (error) {
      diagnostics.push({
        code: "STATE_INVALID",
        severity: "error",
        message: error instanceof Error ? error.message : "Unable to read .m5kdev.json.",
        path: ".m5kdev.json",
        suggestion: "Run m5kdev init to establish a managed baseline.",
      });
      return createDiagnosticReport(diagnostics);
    }
  }

  const cliVersion = getCliVersion();
  if (state.template.name !== TEMPLATE_NAME) {
    diagnostics.push({
      code: "STATE_TEMPLATE_UNKNOWN",
      severity: "error",
      message: `Unsupported template name: ${state.template.name}`,
      path: ".m5kdev.json",
    });
  }
  if (!semver.valid(state.template.version)) {
    diagnostics.push({
      code: "STATE_VERSION_INVALID",
      severity: "error",
      message: `Invalid template version: ${state.template.version}`,
      path: ".m5kdev.json",
    });
  } else if (semver.gt(state.template.version, cliVersion)) {
    diagnostics.push({
      code: "CLI_TOO_OLD",
      severity: "error",
      message: `This repository is managed by ${state.template.version}, but the running CLI is ${cliVersion}.`,
      suggestion: `Run pnpm dlx create-m5kdev@${state.template.version} doctor.`,
    });
  } else if (semver.lt(state.template.version, cliVersion)) {
    diagnostics.push({
      code: "UPDATE_AVAILABLE",
      severity: "warning",
      message: `Template ${cliVersion} is available; this repository is at ${state.template.version}.`,
      suggestion: `Preview it with pnpm dlx create-m5kdev@${cliVersion} update --dry-run.`,
    });
  }

  const manifest = loadTemplateManifest(getTemplateRoot());
  const seenFeatures = new Set<string>();
  for (const feature of state.template.features) {
    if (seenFeatures.has(feature)) {
      diagnostics.push({
        code: "FEATURE_DUPLICATE",
        severity: "error",
        message: `Feature ${feature} is listed more than once.`,
        path: ".m5kdev.json",
      });
    } else if (!(feature in manifest.features)) {
      diagnostics.push({
        code: "FEATURE_UNKNOWN",
        severity: "error",
        message: `Unknown managed feature: ${feature}`,
        path: ".m5kdev.json",
      });
    }
    seenFeatures.add(feature);
  }
  const requiredPaths = new Set(manifest.requiredPaths);
  if (state.template.features.includes("webapp")) requiredPaths.add("apps/webapp/package.json");
  if (state.template.features.includes("expo")) requiredPaths.add("apps/expo/package.json");
  if (state.template.features.includes("test-harness")) requiredPaths.add("apps/e2e/package.json");
  for (const relativePath of requiredPaths) {
    const symlink = await findRepositorySymlink(options.repoRoot, relativePath);
    if (symlink) {
      diagnostics.push({
        code: "MANAGED_PATH_SYMLINK",
        severity: "error",
        message: `Required managed path contains symbolic link ${symlink}.`,
        path: relativePath,
      });
    } else if (!(await exists(path.join(options.repoRoot, relativePath)))) {
      diagnostics.push({
        code: "REQUIRED_PATH_MISSING",
        severity: "error",
        message: "Required managed path is missing.",
        path: relativePath,
        suggestion:
          "Restore the path or correct the enabled features before initializing/updating.",
      });
    }
  }

  const workspaceRelativePath = "pnpm-workspace.yaml";
  const workspacePath = path.join(options.repoRoot, workspaceRelativePath);
  const workspaceSymlink = await findRepositorySymlink(options.repoRoot, workspaceRelativePath);
  if (!workspaceSymlink && (await exists(workspacePath))) {
    try {
      const actualCatalog = readCatalog(await fs.readFile(workspacePath, "utf8"));
      for (const [name, expected] of Object.entries(state.catalog)) {
        if (!semver.validRange(expected)) {
          diagnostics.push({
            code: "CATALOG_VERSION_INVALID",
            severity: "error",
            message: `${name} has an invalid managed SemVer range: ${expected}.`,
            path: ".m5kdev.json",
          });
        }
        if (!(name in actualCatalog)) {
          diagnostics.push({
            code: "CATALOG_ENTRY_MISSING",
            severity: "error",
            message: `Managed catalog entry ${name} is missing.`,
            path: "pnpm-workspace.yaml",
            suggestion: `Restore ${name}: ${expected}.`,
          });
        } else if (actualCatalog[name] !== expected) {
          diagnostics.push({
            code: "CATALOG_VERSION_MISMATCH",
            severity: "error",
            message: `${name} is ${actualCatalog[name]}, expected managed version ${expected}.`,
            path: "pnpm-workspace.yaml",
            suggestion: `Set ${name} to ${expected} in pnpm-workspace.yaml.`,
          });
        }
      }

      const appsDirectory = path.join(options.repoRoot, "apps");
      const packageFiles = [path.join(options.repoRoot, "package.json")];
      if (await exists(appsDirectory)) packageFiles.push(...walkPackageJsonFiles(appsDirectory));
      for (const dependency of collectConsumerDependencyNames(packageFiles)) {
        if (!(dependency in actualCatalog)) {
          diagnostics.push({
            code: "CATALOG_REFERENCE_MISSING",
            severity: "error",
            message: `${dependency} uses catalog: but has no catalog entry.`,
            path: "pnpm-workspace.yaml",
          });
        }
      }
    } catch (error) {
      diagnostics.push({
        code: "CATALOG_INVALID",
        severity: "error",
        message: error instanceof Error ? error.message : "Unable to parse the consumer catalog.",
        path: "pnpm-workspace.yaml",
      });
    }
  }

  for (const [relativePath, baseline] of Object.entries(state.files)) {
    if (baseline.policy === "ignore") continue;
    const filePath = path.join(options.repoRoot, relativePath);
    const symlink = await findRepositorySymlink(options.repoRoot, relativePath);
    if (symlink) {
      diagnostics.push({
        code: "MANAGED_PATH_SYMLINK",
        severity: "error",
        message: `Managed path contains symbolic link ${symlink}.`,
        path: relativePath,
      });
      continue;
    }
    const stat = await fs.lstat(filePath).catch(() => null);
    if (!stat) {
      if (baseline.policy === "ensure") {
        diagnostics.push({
          code: "ENSURED_PATH_MISSING",
          severity: "error",
          message: "An ensured template path is missing.",
          path: relativePath,
        });
      }
      continue;
    }
    if (!stat.isFile()) continue;
    const content = await fs.readFile(filePath);
    if (baseline.sha256 && sha256(content) !== baseline.sha256) {
      diagnostics.push({
        code: "TEMPLATE_CUSTOMIZED",
        severity: "info",
        message: "Managed template content has local customizations.",
        path: relativePath,
      });
    }
    if (baseline.kind === "text") {
      const source = content.toString("utf8");
      if (
        /\{\{(?:APP_NAME|APP_DESCRIPTION|APP_SLUG|PACKAGE_SCOPE|BETTER_AUTH_SECRET)\}\}/.test(
          source
        )
      ) {
        diagnostics.push({
          code: "UNRESOLVED_TEMPLATE_TOKEN",
          severity: "error",
          message: "Unresolved template token found.",
          path: relativePath,
        });
      }
      if (/^(<{7}|={7}|>{7})(?: |$)/m.test(source)) {
        diagnostics.push({
          code: "MERGE_CONFLICT_MARKER",
          severity: "error",
          message: "Unresolved merge conflict marker found.",
          path: relativePath,
        });
      }
    }
  }

  const pending = getPendingMigrations(state, cliVersion);
  for (const migration of pending) {
    diagnostics.push({
      code: "MIGRATION_PENDING",
      severity: "error",
      message: migration.description,
      migrationId: migration.id,
      guide: migration.guide,
      suggestion: `Run pnpm dlx create-m5kdev@${cliVersion} update.`,
    });
  }
  diagnostics.push(
    ...(await runMigrationValidators({
      repoRoot: options.repoRoot,
      state,
      changes: new ChangeSet(options.repoRoot),
    }))
  );

  if (options.full) {
    const packagePath = path.join(options.repoRoot, "package.json");
    let packageManifest: { scripts?: Record<string, string> } | undefined;
    try {
      packageManifest = JSON.parse(await fs.readFile(packagePath, "utf8")) as {
        scripts?: Record<string, string>;
      };
    } catch (error) {
      diagnostics.push({
        code: "PACKAGE_JSON_UNREADABLE",
        severity: "error",
        message:
          error instanceof Error
            ? `Unable to read package.json: ${error.message}`
            : "Unable to read package.json.",
        path: "package.json",
      });
    }
    if (packageManifest) {
      for (const script of ["check-types", "lint", "build"] as const) {
        if (!packageManifest.scripts?.[script]) continue;
        try {
          await execFileAsync("pnpm", [script], {
            cwd: options.repoRoot,
            env: process.env,
            timeout: FULL_COMMAND_TIMEOUT_MS,
          });
        } catch (error) {
          diagnostics.push({
            code: `COMMAND_${script.replace("-", "_").toUpperCase()}_FAILED`,
            severity: "error",
            message: `${script} failed: ${error instanceof Error ? error.message : String(error)}`,
            path: "package.json",
          });
        }
      }
    }
  }

  return createDiagnosticReport(diagnostics);
}
