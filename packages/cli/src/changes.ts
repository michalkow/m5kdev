import fs from "node:fs/promises";
import path from "node:path";

export type PlannedChangeKind = "add" | "modify" | "delete";

export interface PlannedChange {
  kind: PlannedChangeKind;
  path: string;
  content?: Buffer;
  reason: string;
}

export interface PlannedConflict {
  path: string;
  reason: string;
}

function safePath(repoRoot: string, relativePath: string): string {
  if (path.isAbsolute(relativePath))
    throw new Error(`Absolute change path is not allowed: ${relativePath}`);
  const normalized = path.posix.normalize(relativePath.split("\\").join("/"));
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Change path escapes the repository: ${relativePath}`);
  }
  const resolved = path.resolve(repoRoot, normalized);
  if (resolved !== repoRoot && !resolved.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error(`Change path escapes the repository: ${relativePath}`);
  }
  return resolved;
}

export async function findRepositorySymlink(
  repoRoot: string,
  relativePath: string
): Promise<string | undefined> {
  safePath(repoRoot, relativePath);
  const normalized = path.posix.normalize(relativePath.split("\\").join("/"));
  let current = path.resolve(repoRoot);
  let currentRelative = "";
  for (const segment of normalized.split("/")) {
    current = path.join(current, segment);
    currentRelative = currentRelative ? `${currentRelative}/${segment}` : segment;
    const stat = await fs.lstat(current).catch(() => null);
    if (!stat) return undefined;
    if (stat.isSymbolicLink()) return currentRelative;
  }
  return undefined;
}

export class ChangeSet {
  readonly changes = new Map<string, PlannedChange>();
  readonly conflicts: PlannedConflict[] = [];

  constructor(readonly repoRoot: string) {}

  addChange(change: PlannedChange): void {
    safePath(this.repoRoot, change.path);
    this.changes.set(change.path, change);
  }

  addConflict(conflict: PlannedConflict): void {
    safePath(this.repoRoot, conflict.path);
    this.conflicts.push(conflict);
  }

  async read(pathName: string): Promise<Buffer | undefined> {
    const planned = this.changes.get(pathName);
    if (planned) return planned.kind === "delete" ? undefined : planned.content;
    const symlink = await findRepositorySymlink(this.repoRoot, pathName);
    if (symlink) throw new Error(`Refusing to read through symlink: ${symlink}`);
    return fs.readFile(safePath(this.repoRoot, pathName)).catch(() => undefined);
  }

  async apply(): Promise<void> {
    if (this.conflicts.length > 0) throw new Error("Cannot apply a change set with conflicts.");
    const changes = [...this.changes.values()].sort((left, right) =>
      left.path.localeCompare(right.path)
    );
    for (const change of changes) {
      const target = safePath(this.repoRoot, change.path);
      const symlink = await findRepositorySymlink(this.repoRoot, change.path);
      if (symlink) throw new Error(`Refusing to write through symlink: ${symlink}`);
      if (change.kind === "delete") {
        await fs.rm(target, { force: true });
        continue;
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, change.content ?? Buffer.alloc(0));
    }
  }
}
