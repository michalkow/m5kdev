import { execFileSync } from "node:child_process";
import { posix } from "node:path";

export interface MigrationCheckOptions {
  /** Repository working directory. Default `process.cwd()`. */
  readonly cwd?: string;
  /** Migration folder relative to the repository root, e.g. `apps/server/drizzle-postgresql`. */
  readonly folder: string;
  /** Git ref whose migration history is frozen, e.g. `origin/main`. Omit to check sync only. */
  readonly base?: string;
}

export interface MigrationCheckResult {
  readonly ok: boolean;
  readonly problems: string[];
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * Fail when a migration that exists on `base` was edited or deleted. New
 * migrations (new files and appended journal entries) are allowed.
 */
function frozenHistoryProblems(cwd: string, folder: string, base: string): string[] {
  const mergeBase = git(cwd, ["merge-base", base, "HEAD"]).trim();
  const changes = git(cwd, [
    "diff",
    "--name-status",
    "--no-renames",
    mergeBase,
    "HEAD",
    "--",
    folder,
  ])
    .split("\n")
    .filter(Boolean);
  const journalPath = posix.join(folder, "meta", "_journal.json");
  const problems: string[] = [];
  for (const line of changes) {
    const [status, file] = line.split("\t");
    if (!file || status === "A" || file === journalPath) continue;
    problems.push(
      `${file} is frozen: migrations already on ${base} must not be ${status === "D" ? "deleted" : "edited"}`
    );
  }
  return [...problems, ...journalProblems(cwd, journalPath, mergeBase, base)];
}

type JournalEntry = { idx: number; tag: string; when: number };

function readJournal(cwd: string, ref: string, journalPath: string): JournalEntry[] | undefined {
  try {
    const source = git(cwd, ["show", `${ref}:${journalPath}`]);
    return (JSON.parse(source) as { entries: JournalEntry[] }).entries;
  } catch {
    return undefined;
  }
}

/** Journal entries on `base` must appear unchanged, in order, at the start of HEAD's journal. */
function journalProblems(
  cwd: string,
  journalPath: string,
  mergeBase: string,
  base: string
): string[] {
  const before = readJournal(cwd, mergeBase, journalPath);
  if (!before) return [];
  const after = readJournal(cwd, "HEAD", journalPath) ?? [];
  const problems: string[] = [];
  before.forEach((entry, index) => {
    const current = after[index];
    if (
      !current ||
      current.tag !== entry.tag ||
      current.when !== entry.when ||
      current.idx !== entry.idx
    ) {
      problems.push(
        `${entry.tag} is frozen: its journal entry on ${base} was removed or rewritten in ${journalPath}`
      );
    }
  });
  return problems;
}

/**
 * Run after `drizzle:generate`: any new or modified file in the migration folder
 * means a table definition changed without a committed migration.
 */
function outOfSyncProblems(cwd: string, folder: string): string[] {
  const changed = git(cwd, ["status", "--porcelain", "--untracked-files=all", "--", folder])
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3));
  if (changed.length === 0) return [];
  return [
    `Migrations are out of sync with the table definitions: drizzle:generate produced uncommitted changes in ${changed.join(", ")}. Run drizzle:generate and commit the result.`,
  ];
}

export function runMigrationCheck(options: MigrationCheckOptions): MigrationCheckResult {
  const cwd = options.cwd ?? process.cwd();
  const problems = [
    ...outOfSyncProblems(cwd, options.folder),
    ...(options.base ? frozenHistoryProblems(cwd, options.folder, options.base) : []),
  ];
  return { ok: problems.length === 0, problems };
}
