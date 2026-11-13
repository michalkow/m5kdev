import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import semver from "semver";
import type { ChangeSet, PlannedChange, PlannedConflict } from "./changes";
import {
  createDiagnosticReport,
  type DiagnosticReport,
  type VerificationCheck,
} from "./diagnostics";
import { diagnoseManagedRepo } from "./doctor";
import { collectTemplateFiles } from "./fs";
import {
  getMigrationRegistry,
  getPendingMigrations,
  runMigrationValidators,
} from "./migrations/registry";
import type { MigrationDefinition } from "./migrations/types";
import { getTemplateRoot } from "./paths";
import { resolveHarnessAndModuleOptions } from "./prompts";
import { type BaseTemplateProvider, reconcileTemplates } from "./reconcile";
import { getCliVersion, type ManagedState, readManagedState, STATE_FILE_NAME } from "./state";
import {
  enabledEnvironments,
  environmentFeature,
  getEnabledFeatures,
  hasProductStack,
  LANDING_ONLY_ENVIRONMENTS_ERROR,
  loadTemplateManifest,
  withImpliedFeatures,
} from "./template";
import type { AppPlatform, OptionalEnvironment } from "./types";

const execFileAsync = promisify(execFile);

export interface UpdateCommandOptions {
  repoRoot: string;
  dryRun: boolean;
  skipInstall: boolean;
  yes?: boolean;
  platform?: AppPlatform;
  testHarness?: boolean;
  modules?: string[];
  /** Add optional Deployment environments (staging, canary) to the app. */
  environments?: OptionalEnvironment[];
  baseProvider?: BaseTemplateProvider;
  /** Test seam; published commands always use the embedded production registry. */
  registry?: readonly MigrationDefinition[];
  /** Test seams for fixture-version updates. */
  targetTemplateRoot?: string;
  targetVersion?: string;
  assertClean?: (repoRoot: string) => Promise<void>;
  install?: (repoRoot: string) => Promise<void>;
}

export interface UpdateResult {
  fromVersion: string;
  targetVersion: string;
  dryRun: boolean;
  applied: boolean;
  changes: Array<Omit<PlannedChange, "content">>;
  conflicts: PlannedConflict[];
  migrations: string[];
  dependenciesChanged: boolean;
  installRequired: boolean;
  preflight: DiagnosticReport;
  postflight?: DiagnosticReport;
  verification: VerificationCheck[];
}

function installationRequired(report: DiagnosticReport): boolean {
  return report.diagnostics.some(
    ({ code, path: file }) =>
      code === "DEPENDENCY_MISSING" ||
      code.startsWith("INSTALLED_") ||
      (code === "EXECUTABLE_MISSING" && Boolean(file))
  );
}

async function assertCleanGit(repoRoot: string): Promise<void> {
  const result = await execFileAsync("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.stdout.trim()) {
    throw new Error(
      "Write-mode update requires a clean Git worktree. Commit or stash changes first."
    );
  }
}

/** Add optional Deployment environments to managed state; existing ones are kept. */
function withEnvironments(
  state: ManagedState,
  environments: readonly OptionalEnvironment[] | undefined
): ManagedState {
  if (!environments?.length) return state;
  if (!hasProductStack(state.template.features)) {
    throw new Error(LANDING_ONLY_ENVIRONMENTS_ERROR);
  }
  const features = new Set(state.template.features);
  for (const environment of environments) features.add(environmentFeature(environment));
  return { ...state, template: { ...state.template, features: [...features].sort() } };
}

async function resolveUpgradeState(options: {
  state: ManagedState;
  platform?: AppPlatform;
  yes: boolean;
  testHarness?: boolean;
  modules?: string[];
  environments?: OptionalEnvironment[];
}): Promise<ManagedState> {
  return withEnvironments(await resolvePlatformUpgrade(options), options.environments);
}

async function resolvePlatformUpgrade(options: {
  state: ManagedState;
  platform?: AppPlatform;
  yes: boolean;
  testHarness?: boolean;
  modules?: string[];
}): Promise<ManagedState> {
  if (!options.platform) return options.state;
  if (options.platform === "landing") {
    throw new Error("m5kdev update --platform cannot switch to landing.");
  }
  const current = new Set(options.state.template.features);
  if (current.has("webapp") || current.has("expo")) {
    throw new Error(
      "m5kdev update --platform is only for landing-only apps. This repository already has a Webapp or Expo client."
    );
  }
  const extras = await resolveHarnessAndModuleOptions({
    yes: options.yes,
    testHarness: options.testHarness,
    modules: options.modules,
  });
  const enabledFeatures = getEnabledFeatures({
    platform: options.platform,
    testHarness: extras.testHarness,
    modules: extras.modules,
    docsHosting: current.has("docs-landing")
      ? "landing"
      : current.has("docs-server")
        ? "server"
        : "standalone",
  });
  return {
    ...options.state,
    template: {
      ...options.state.template,
      features: [...enabledFeatures].sort(),
    },
  };
}

function overlayEnv(base: string, overlay: string): string {
  if (!overlay.trim()) return base;
  let next = base;
  for (const line of overlay.split("\n")) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    const assignment = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(next)) next = next.replace(pattern, assignment);
    else next = `${next}${next.endsWith("\n") || next.length === 0 ? "" : "\n"}${assignment}\n`;
  }
  return next;
}

/**
 * Fly configs are `ignore` on update so app names and regions stay the app's.
 * When `update --environments` enables an environment, its own Deploy home files
 * are new to the app, so add the ones that are missing.
 */
async function planNewEnvironmentFiles(options: {
  repoRoot: string;
  templateRoot: string;
  previous: ManagedState;
  state: ManagedState;
  changes: ChangeSet;
}): Promise<void> {
  const before = new Set(enabledEnvironments(options.previous.template.features));
  const added = enabledEnvironments(options.state.template.features).filter(
    (environment) => !before.has(environment)
  );
  if (added.length === 0) return;
  const manifest = loadTemplateManifest(options.templateRoot);
  const paths = new Set(
    added.flatMap((environment) => manifest.features[environmentFeature(environment)]?.paths ?? [])
  );
  const files = await collectTemplateFiles(
    options.templateRoot,
    { ...options.state.template.context, betterAuthSecret: "ignored-by-managed-state" },
    { enabledFeatures: withImpliedFeatures(new Set(options.state.template.features)) }
  );
  for (const file of files) {
    if (!paths.has(file.relativePath) || options.changes.changes.has(file.relativePath)) continue;
    const present = await fs
      .access(path.join(options.repoRoot, file.relativePath))
      .then(() => true)
      .catch(() => false);
    if (present) continue;
    options.changes.addChange({
      kind: "add",
      path: file.relativePath,
      content: file.content,
      reason: "Add Deploy home file for a new Deployment environment",
    });
  }
}

const HEALTH_CHECK_BLOCK = `
# Fly routes traffic only once the Kernel's /healthz answers.
[[http_service.checks]]
  grace_period = "15s"
  interval = "30s"
  timeout = "5s"
  method = "GET"
  path = "/healthz"
`;

/**
 * Apps that predate Deployment environments deploy from `apps/shared/fly.toml`.
 * Fly configs are `ignore` on update, so add the per-environment files the
 * deploy workflow now reads: Production keeps the existing Fly app (its name,
 * region and machines) plus the /healthz check; Development comes from the
 * template. `fly.toml` is left for the maintainer to delete.
 */
/**
 * The Kernel requires `APP_ENV` and `APP_SLUG` at boot, but local env files are
 * `ignore` on update. Append only the keys a file lacks; never change a value.
 */
async function planDeploymentEnvironmentKeys(options: {
  repoRoot: string;
  state: ManagedState;
  changes: ChangeSet;
}): Promise<void> {
  if (!hasProductStack(options.state.template.features)) return;
  const files: { path: string; environment: string }[] = [
    { path: "apps/shared/.env", environment: "local" },
    { path: "apps/shared/.env.production", environment: "production" },
  ];
  for (const file of files) {
    const plannedChange = options.changes.changes.get(file.path);
    const planned = plannedChange?.content?.toString("utf8");
    const current =
      planned ??
      (await fs.readFile(path.join(options.repoRoot, file.path), "utf8").catch(() => undefined));
    if (current === undefined) continue;
    const wanted: [string, string][] = [
      ["APP_ENV", file.environment],
      ["APP_SLUG", options.state.template.context.appSlug],
    ];
    const missing = wanted.filter(([key]) => !new RegExp(`^${key}=`, "m").test(current));
    if (missing.length === 0) continue;
    const lines = missing.map(([key, value]) => `${key}=${value}`).join("\n");
    const separator = current.length === 0 || current.endsWith("\n") ? "" : "\n";
    options.changes.addChange({
      kind: plannedChange?.kind === "add" ? "add" : "modify",
      path: file.path,
      content: Buffer.from(`${current}${separator}${lines}\n`),
      reason: `Add ${missing.map(([key]) => key).join(" and ")} (required by the Kernel at boot)`,
    });
  }
}

async function planPerEnvironmentFlyFiles(options: {
  repoRoot: string;
  templateRoot: string;
  state: ManagedState;
  changes: ChangeSet;
}): Promise<void> {
  if (!hasProductStack(options.state.template.features)) return;
  const shared = "apps/shared";
  const productionPath = `${shared}/fly.production.toml`;
  const developmentPath = `${shared}/fly.development.toml`;
  const legacyPath = `${shared}/fly.toml`;
  const exists = (relativePath: string) =>
    fs
      .access(path.join(options.repoRoot, relativePath))
      .then(() => true)
      .catch(() => false);
  const missing = async (relativePath: string) =>
    !options.changes.changes.has(relativePath) && !(await exists(relativePath));

  const needsProduction = await missing(productionPath);
  const needsDevelopment = await missing(developmentPath);
  if (!needsProduction && !needsDevelopment) return;

  const files = await collectTemplateFiles(
    options.templateRoot,
    { ...options.state.template.context, betterAuthSecret: "ignored-by-managed-state" },
    { enabledFeatures: withImpliedFeatures(new Set(options.state.template.features)) }
  );
  const template = (relativePath: string) =>
    files.find((file) => file.relativePath === relativePath)?.content;

  if (needsProduction) {
    const legacy = await fs
      .readFile(path.join(options.repoRoot, legacyPath), "utf8")
      .catch(() => undefined);
    if (legacy !== undefined) {
      const content = legacy.includes('"/healthz"')
        ? legacy
        : `${legacy}${legacy.endsWith("\n") ? "" : "\n"}${HEALTH_CHECK_BLOCK}`;
      options.changes.addChange({
        kind: "add",
        path: productionPath,
        content: Buffer.from(content),
        reason: `Copy ${legacyPath} (keeps the Fly app name) into the Production Fly config with a /healthz check; delete ${legacyPath} once Production deploys from ${productionPath}`,
      });
    } else {
      const content = template(productionPath);
      if (content) {
        options.changes.addChange({
          kind: "add",
          path: productionPath,
          content,
          reason: "Add the Production Fly config",
        });
      }
    }
  }

  if (needsDevelopment) {
    const content = template(developmentPath);
    if (content) {
      options.changes.addChange({
        kind: "add",
        path: developmentPath,
        content,
        reason: "Add the Development Fly config",
      });
    }
  }
}

async function planLandingEnvMigration(options: {
  repoRoot: string;
  templateRoot: string;
  state: ManagedState;
  changes: ChangeSet;
}): Promise<void> {
  const sharedEnvRelative = "apps/shared/.env";
  const landingEnvRelative = "apps/landing/.env";
  const landingExampleRelative = "apps/landing/.env.example";
  const landingEnv = await fs
    .readFile(path.join(options.repoRoot, landingEnvRelative), "utf8")
    .catch(() => "");
  const existing = await options.changes.read(sharedEnvRelative);
  const files = await collectTemplateFiles(
    options.templateRoot,
    {
      ...options.state.template.context,
      betterAuthSecret: "ignored-by-managed-state",
    },
    {
      enabledFeatures: withImpliedFeatures(new Set(options.state.template.features)),
    }
  );
  const sharedEnv = files.find((file) => file.relativePath === sharedEnvRelative);
  const base = existing?.toString("utf8") || sharedEnv?.content.toString("utf8") || "";
  if (base.length > 0) {
    const content = overlayEnv(base, landingEnv);
    if (!existing || content !== existing.toString("utf8")) {
      options.changes.addChange({
        kind: existing ? "modify" : "add",
        path: sharedEnvRelative,
        content: Buffer.from(content),
        reason: "Copy Landing env into Deploy home",
      });
    }
  }
  for (const relativePath of [landingEnvRelative, landingExampleRelative]) {
    const present = await fs
      .access(path.join(options.repoRoot, relativePath))
      .then(() => true)
      .catch(() => false);
    if (!present) continue;
    options.changes.addChange({
      kind: "delete",
      path: relativePath,
      reason: "Remove Landing-local env after attaching Deploy home",
    });
  }
}

export async function updateManagedRepo(options: UpdateCommandOptions): Promise<UpdateResult> {
  const state = await readManagedState(options.repoRoot);
  const targetVersion = options.targetVersion ?? getCliVersion();
  if (semver.gt(state.template.version, targetVersion)) {
    throw new Error(
      `The running CLI ${targetVersion} is older than managed state ${state.template.version}.`
    );
  }
  const templateRoot = options.targetTemplateRoot ?? getTemplateRoot();
  const diagnosticOptions = {
    repoRoot: options.repoRoot,
    templateRoot,
    cliVersion: targetVersion,
    registry: options.registry,
  };
  const preflight = await diagnoseManagedRepo({ ...diagnosticOptions, state });
  const outstanding: VerificationCheck[] = [
    {
      id: "upgrade-guides",
      status: "configured-but-untested",
      message:
        "Automatic template changes do not establish that manual/conditional guide steps are complete.",
      suggestion: `Apply the applicable upgrade guides from ${state.template.version} to ${targetVersion}, including affected migration, CI, deployment, and documentation paths.`,
    },
    {
      id: "upgrade-full",
      status: "configured-but-untested",
      message: "Full validation and complete user journeys have not been verified by update.",
      suggestion: `After the guide steps, run pnpm dlx create-m5kdev@${targetVersion} doctor --full and record guide-specific execution evidence. Production operations require explicit user instruction.`,
    },
  ];
  const result: UpdateResult = {
    fromVersion: state.template.version,
    targetVersion,
    dryRun: options.dryRun,
    applied: false,
    changes: [],
    conflicts: [],
    migrations: [],
    dependenciesChanged: false,
    installRequired: installationRequired(preflight),
    preflight,
    verification: [...outstanding],
  };
  const unsafeCodes = new Set([
    "STATE_INVALID",
    "STATE_TEMPLATE_UNKNOWN",
    "STATE_VERSION_INVALID",
    "FEATURE_UNKNOWN",
    "FEATURE_DUPLICATE",
    "MANAGED_PATH_SYMLINK",
    "CATALOG_INVALID",
    "PACKAGE_JSON_UNREADABLE",
  ]);
  const unsafe = preflight.diagnostics.filter(
    (diagnostic) =>
      unsafeCodes.has(diagnostic.code) ||
      (diagnostic.code === "REQUIRED_PATH_MISSING" &&
        (diagnostic.path === "package.json" || diagnostic.path === "pnpm-workspace.yaml")) ||
      (diagnostic.code === "EXECUTABLE_MISSING" &&
        !options.dryRun &&
        !diagnostic.path &&
        diagnostic.message.includes("git"))
  );
  if (unsafe.length) {
    result.conflicts = unsafe.map((diagnostic) => ({
      path: diagnostic.path ?? ".m5kdev.json",
      reason: `[${diagnostic.code}] ${diagnostic.message}`,
    }));
    result.verification.unshift({
      id: "preflight",
      status: "blocked",
      message: "Unsafe source/state prerequisites prevent a write-mode update.",
      suggestion: "Resolve the preflight errors before retrying.",
    });
    return result;
  }
  const upgradedState = await resolveUpgradeState({
    state,
    platform: options.platform,
    yes: Boolean(options.yes),
    testHarness: options.testHarness,
    modules: options.modules,
    environments: options.environments,
  });
  if (!options.dryRun) await (options.assertClean ?? assertCleanGit)(options.repoRoot);

  const reconciliation = await reconcileTemplates({
    repoRoot: options.repoRoot,
    state: upgradedState,
    targetTemplateRoot: templateRoot,
    targetVersion,
    baseProvider: options.baseProvider,
  });
  if (options.platform && options.platform !== "landing") {
    await planLandingEnvMigration({
      repoRoot: options.repoRoot,
      templateRoot,
      state: upgradedState,
      changes: reconciliation.changes,
    });
  }
  await planDeploymentEnvironmentKeys({
    repoRoot: options.repoRoot,
    state: upgradedState,
    changes: reconciliation.changes,
  });
  await planPerEnvironmentFlyFiles({
    repoRoot: options.repoRoot,
    templateRoot,
    state: upgradedState,
    changes: reconciliation.changes,
  });
  await planNewEnvironmentFiles({
    repoRoot: options.repoRoot,
    templateRoot,
    previous: state,
    state: upgradedState,
    changes: reconciliation.changes,
  });
  const registry = options.registry ?? getMigrationRegistry();
  const pending = getPendingMigrations(upgradedState, targetVersion, registry);
  const appliedMigrations: string[] = [];
  for (const migration of pending) {
    const context = {
      repoRoot: options.repoRoot,
      state: upgradedState,
      changes: reconciliation.changes,
    };
    if (migration.applies && !(await migration.applies(context))) continue;
    await migration.plan(context);
    appliedMigrations.push(migration.id);
  }
  reconciliation.targetState.appliedMigrations = [
    ...new Set([...upgradedState.appliedMigrations, ...appliedMigrations]),
  ];

  const validationDiagnostics = await runMigrationValidators(
    {
      repoRoot: options.repoRoot,
      state: reconciliation.targetState,
      changes: reconciliation.changes,
    },
    registry
  );
  for (const diagnostic of validationDiagnostics) {
    if (diagnostic.severity !== "error") continue;
    reconciliation.changes.addConflict({
      path: diagnostic.path ?? ".m5kdev.json",
      reason: `[${diagnostic.code}] ${diagnostic.message}`,
    });
  }

  const stateContent = Buffer.from(`${JSON.stringify(reconciliation.targetState, null, 2)}\n`);
  const currentState = await reconciliation.changes.read(STATE_FILE_NAME);
  if (!currentState?.equals(stateContent)) {
    reconciliation.changes.addChange({
      kind: currentState ? "modify" : "add",
      path: STATE_FILE_NAME,
      content: stateContent,
      reason: "Advance managed template state",
    });
  }

  Object.assign(result, {
    changes: [...reconciliation.changes.changes.values()].map(
      ({ content: _content, ...change }) => change
    ),
    conflicts: [...reconciliation.changes.conflicts],
    migrations: appliedMigrations,
    dependenciesChanged: reconciliation.dependenciesChanged,
    installRequired: reconciliation.dependenciesChanged || installationRequired(preflight),
  });
  if (options.dryRun || result.conflicts.length > 0) {
    result.verification.unshift({
      id: "template-update",
      status: result.conflicts.length ? "blocked" : "configured-but-untested",
      message: result.conflicts.length
        ? "Template conflicts prevent application."
        : "Dry-run only: no target source or installation has been applied.",
      suggestion: result.conflicts.length
        ? "Resolve the reported conflicts and retry."
        : "Review the plan before applying it.",
    });
    return result;
  }

  await reconciliation.changes.apply();
  result.applied = true;
  let installFailed = false;
  if (result.installRequired && !options.skipInstall) {
    try {
      if (options.install) await options.install(path.resolve(options.repoRoot));
      else
        await execFileAsync("pnpm", ["install"], {
          cwd: path.resolve(options.repoRoot),
          env: process.env,
        });
    } catch {
      installFailed = true;
    }
  }
  const postflight = await diagnoseManagedRepo({
    ...diagnosticOptions,
    state: reconciliation.targetState,
  });
  if (installFailed) {
    postflight.diagnostics.push({
      code: "INSTALL_FAILED",
      severity: "error",
      message:
        "Template changes were applied, but pnpm install failed. Rerun it to inspect the output.",
      suggestion: "Run pnpm install and then doctor --full after completing the guides.",
    });
    postflight.verification.push({
      id: "installation",
      status: "blocked",
      message: "Dependency installation failed after applying template changes.",
      suggestion: "Resolve pnpm install errors, then rerun doctor --full.",
    });
  }
  result.postflight = createDiagnosticReport(postflight.diagnostics, postflight.verification);
  result.verification = [
    {
      id: "template-update",
      status: "verified",
      message: "Template changes were applied; this is not evidence of a working upgrade.",
    },
    ...postflight.verification,
    ...outstanding,
  ];
  result.installRequired = installationRequired(postflight) || installFailed;
  return result;
}
