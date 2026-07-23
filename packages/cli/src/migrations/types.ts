import type { ChangeSet } from "../changes";
import type { Diagnostic } from "../diagnostics";
import type { ManagedState } from "../state";

export interface MigrationContext {
  repoRoot: string;
  state: ManagedState;
  changes: ChangeSet;
}

export interface MigrationDefinition {
  id: string;
  targetVersion: string;
  description: string;
  guide: string;
  applies?: (context: MigrationContext) => boolean | Promise<boolean>;
  plan: (context: MigrationContext) => void | Promise<void>;
  validate?: (context: MigrationContext) => Diagnostic[] | Promise<Diagnostic[]>;
}
