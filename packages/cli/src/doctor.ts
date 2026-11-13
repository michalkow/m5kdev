import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import semver from "semver";
import {
  collectCatalogProtocolDependencies,
  MANAGED_CATALOG_SPECIFIER,
  readCatalog,
  readDefaultCatalog,
  walkPackageJsonFiles,
} from "./catalog";
import { ChangeSet, findRepositorySymlink } from "./changes";
import { TEMPLATE_NAME } from "./constants";
import {
  createDiagnosticReport,
  type Diagnostic,
  type DiagnosticReport,
  type VerificationCheck,
} from "./diagnostics";
import { getPendingMigrations, runMigrationValidators } from "./migrations/registry";
import type { MigrationDefinition } from "./migrations/types";
import { getTemplateRoot } from "./paths";
import { inspectReadiness } from "./readiness";
import { getCliVersion, type ManagedState, readManagedState, sha256 } from "./state";
import { hasProductStack, loadTemplateManifest } from "./template";

const execFileAsync = promisify(execFile);
const FULL_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

export interface DoctorOptions {
  repoRoot: string;
  full?: boolean;
  state?: ManagedState;
  /** Enrollment checks source compatibility before dependencies need to be installed. */
  checkInstallation?: boolean;
  templateRoot?: string;
  cliVersion?: string;
  registry?: readonly MigrationDefinition[];
}

async function exists(filePath: string): Promise<boolean> {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

export async function diagnoseManagedRepo(options: DoctorOptions): Promise<DiagnosticReport> {
  const diagnostics: Diagnostic[] = [];
  const verification: VerificationCheck[] = [];
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

  const cliVersion = options.cliVersion ?? getCliVersion();
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

  const manifest = loadTemplateManifest(options.templateRoot ?? getTemplateRoot());
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
  if (hasProductStack(state.template.features)) {
    requiredPaths.add("apps/shared/package.json");
    requiredPaths.add("apps/server/package.json");
    requiredPaths.add("apps/email/package.json");
  }
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
      const workspaceSource = await fs.readFile(workspacePath, "utf8");
      const actualCatalog = readCatalog(workspaceSource);
      const defaultCatalog = readDefaultCatalog(workspaceSource);
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
      for (const { name, specifier } of collectCatalogProtocolDependencies(packageFiles)) {
        const catalog =
          specifier === MANAGED_CATALOG_SPECIFIER
            ? actualCatalog
            : specifier === "catalog:"
              ? defaultCatalog
              : undefined;
        if (catalog === undefined) continue;
        if (!(name in catalog)) {
          diagnostics.push({
            code: "CATALOG_REFERENCE_MISSING",
            severity: "error",
            message: `${name} uses ${specifier} but has no matching catalog entry.`,
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

  const pending = getPendingMigrations(state, cliVersion, options.registry);
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
    ...(await runMigrationValidators(
      {
        repoRoot: options.repoRoot,
        state,
        changes: new ChangeSet(options.repoRoot),
      },
      options.registry
    ))
  );

  verification.push({
    id: "managed-source",
    status: diagnostics.some((diagnostic) => diagnostic.severity === "error")
      ? "blocked"
      : "verified",
    message:
      "Inspected managed state, declared catalogs, file markers, and migration validators; this is a source check only.",
  });
  const readiness = await inspectReadiness({
    repoRoot: options.repoRoot,
    state,
    checkInstallation: options.checkInstallation !== false,
  });
  diagnostics.push(...readiness.diagnostics);
  verification.push(...readiness.verification);

  const packagePath = path.join(options.repoRoot, "package.json");
  let packageManifest: { scripts?: Record<string, string> } | undefined;
  try {
    packageManifest = JSON.parse(await fs.readFile(packagePath, "utf8"));
  } catch {
    diagnostics.push({
      code: "PACKAGE_JSON_UNREADABLE",
      severity: "error",
      message: "Unable to read package.json.",
      path: "package.json",
    });
  }
  if (packageManifest) {
    const commands = ["check-types", "lint", "build"];
    if (
      packageManifest.scripts?.["docs:build"] ||
      state.template.features.some((feature) => feature.startsWith("docs-"))
    )
      commands.push("docs:build");
    for (const script of commands) {
      const code = script.replace(/[^a-z0-9]+/gi, "_").toUpperCase();
      const check: VerificationCheck = {
        id: `command:${script}`,
        status: "configured-but-untested",
        message: `pnpm ${script} is configured but has not been executed.`,
        path: "package.json",
        suggestion: "Run doctor --full after applying the relevant upgrade guides.",
      };
      if (
        typeof packageManifest.scripts?.[script] !== "string" ||
        !packageManifest.scripts[script]?.trim()
      ) {
        diagnostics.push({
          code: `COMMAND_${code}_MISSING`,
          severity: "error",
          message: `Required ${script} script is missing.`,
          path: "package.json",
          suggestion:
            "Restore the appropriate validation script before final upgrade verification.",
        });
        check.status = "blocked";
        check.message = `Cannot run pnpm ${script}: the script is missing.`;
      } else if (options.full) {
        try {
          await execFileAsync("pnpm", [script], {
            cwd: options.repoRoot,
            env: process.env,
            timeout: FULL_COMMAND_TIMEOUT_MS,
            maxBuffer: 10 * 1024 * 1024,
          });
          check.status = "verified";
          check.message = `Local ${script} command passed; this does not prove deployment or live database behavior.`;
          check.evidence = [`pnpm ${script} completed successfully.`];
          check.suggestion = undefined;
        } catch {
          diagnostics.push({
            code: `COMMAND_${code}_FAILED`,
            severity: "error",
            message: `pnpm ${script} failed. Rerun the command to inspect its output.`,
            path: "package.json",
          });
          check.status = "blocked";
          check.message = `pnpm ${script} failed.`;
          check.suggestion = `Run pnpm ${script}, resolve its errors, and rerun doctor --full.`;
        }
      }
      verification.push(check);
    }
  }

  return createDiagnosticReport(diagnostics, verification);
}
