import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import semver from "semver";
import type { ChangeSet, PlannedChange, PlannedConflict } from "./changes";
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
import { getEnabledFeatures, withImpliedFeatures } from "./template";
import type { AppPlatform } from "./types";

const execFileAsync = promisify(execFile);

export interface UpdateCommandOptions {
  repoRoot: string;
  dryRun: boolean;
  skipInstall: boolean;
  yes?: boolean;
  platform?: AppPlatform;
  testHarness?: boolean;
  modules?: string[];
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

async function resolveUpgradeState(options: {
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
  const upgradedState = await resolveUpgradeState({
    state,
    platform: options.platform,
    yes: Boolean(options.yes),
    testHarness: options.testHarness,
    modules: options.modules,
  });
  if (!options.dryRun) await (options.assertClean ?? assertCleanGit)(options.repoRoot);

  const templateRoot = options.targetTemplateRoot ?? getTemplateRoot();
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

  const result: UpdateResult = {
    fromVersion: state.template.version,
    targetVersion,
    dryRun: options.dryRun,
    applied: false,
    changes: [...reconciliation.changes.changes.values()].map(
      ({ content: _content, ...change }) => change
    ),
    conflicts: [...reconciliation.changes.conflicts],
    migrations: appliedMigrations,
    dependenciesChanged: reconciliation.dependenciesChanged,
    installRequired: reconciliation.dependenciesChanged && options.skipInstall,
  };
  if (options.dryRun || result.conflicts.length > 0) return result;

  await reconciliation.changes.apply();
  result.applied = true;
  if (reconciliation.dependenciesChanged && !options.skipInstall) {
    if (options.install) await options.install(path.resolve(options.repoRoot));
    else
      await execFileAsync("pnpm", ["install"], {
        cwd: path.resolve(options.repoRoot),
        env: process.env,
      });
  }
  return result;
}
