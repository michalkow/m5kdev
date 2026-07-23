import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import semver from "semver";
import type { PlannedChange, PlannedConflict } from "./changes";
import {
  getMigrationRegistry,
  getPendingMigrations,
  runMigrationValidators,
} from "./migrations/registry";
import type { MigrationDefinition } from "./migrations/types";
import { getTemplateRoot } from "./paths";
import { type BaseTemplateProvider, reconcileTemplates } from "./reconcile";
import { getCliVersion, readManagedState, STATE_FILE_NAME } from "./state";

const execFileAsync = promisify(execFile);

export interface UpdateCommandOptions {
  repoRoot: string;
  dryRun: boolean;
  skipInstall: boolean;
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

export async function updateManagedRepo(options: UpdateCommandOptions): Promise<UpdateResult> {
  const state = await readManagedState(options.repoRoot);
  const targetVersion = options.targetVersion ?? getCliVersion();
  if (semver.gt(state.template.version, targetVersion)) {
    throw new Error(
      `The running CLI ${targetVersion} is older than managed state ${state.template.version}.`
    );
  }
  if (!options.dryRun) await (options.assertClean ?? assertCleanGit)(options.repoRoot);

  const reconciliation = await reconcileTemplates({
    repoRoot: options.repoRoot,
    state,
    targetTemplateRoot: options.targetTemplateRoot ?? getTemplateRoot(),
    targetVersion,
    baseProvider: options.baseProvider,
  });
  const registry = options.registry ?? getMigrationRegistry();
  const pending = getPendingMigrations(state, targetVersion, registry);
  const appliedMigrations: string[] = [];
  for (const migration of pending) {
    const context = { repoRoot: options.repoRoot, state, changes: reconciliation.changes };
    if (migration.applies && !(await migration.applies(context))) continue;
    await migration.plan(context);
    appliedMigrations.push(migration.id);
  }
  reconciliation.targetState.appliedMigrations = [
    ...new Set([...state.appliedMigrations, ...appliedMigrations]),
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
  if (!currentState || !currentState.equals(stateContent)) {
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
