import semver from "semver";
import type { Diagnostic } from "../diagnostics";
import type { ManagedState } from "../state";
import type { MigrationContext, MigrationDefinition } from "./types";

const migrations: MigrationDefinition[] = [];

export function validateMigrationRegistry(
  registry: readonly MigrationDefinition[] = migrations
): void {
  const ids = new Set<string>();
  let previousVersion: string | undefined;
  for (const migration of registry) {
    if (ids.has(migration.id)) throw new Error(`Duplicate migration id: ${migration.id}`);
    if (!semver.valid(migration.targetVersion)) {
      throw new Error(
        `Invalid target version for migration ${migration.id}: ${migration.targetVersion}`
      );
    }
    if (previousVersion && semver.gt(previousVersion, migration.targetVersion)) {
      throw new Error(`Migration registry is not ordered at ${migration.id}`);
    }
    ids.add(migration.id);
    previousVersion = migration.targetVersion;
  }
}

export function getPendingMigrations(
  state: ManagedState,
  targetVersion: string,
  registry: readonly MigrationDefinition[] = migrations
): MigrationDefinition[] {
  validateMigrationRegistry(registry);
  const applied = new Set(state.appliedMigrations);
  return registry.filter(
    (migration) =>
      !applied.has(migration.id) &&
      semver.gt(migration.targetVersion, state.template.version) &&
      semver.lte(migration.targetVersion, targetVersion)
  );
}

export async function runMigrationValidators(
  context: MigrationContext,
  registry: readonly MigrationDefinition[] = migrations
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const applied = new Set(context.state.appliedMigrations);
  for (const migration of registry) {
    if (!applied.has(migration.id) || !migration.validate) continue;
    diagnostics.push(...(await migration.validate(context)));
  }
  return diagnostics;
}

export function getMigrationRegistry(): readonly MigrationDefinition[] {
  return migrations;
}
