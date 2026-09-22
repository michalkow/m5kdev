import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import semver from "semver";

export interface LandedBehavior {
  readonly behavior: string;
  readonly sameAs: string | null;
}

export interface RevertedBehavior {
  readonly behavior: string;
  readonly matchesBullet: string | null;
}

export interface ReleaseThread {
  readonly landed: readonly LandedBehavior[];
  readonly reverted: readonly RevertedBehavior[];
}

export interface RecordReleaseNotesResult {
  readonly uncertainReverts: readonly string[];
}

export type ReleaseBump = "major" | "minor" | "patch";

export type JudgeReleaseResult =
  | { readonly status: "needs-bump" }
  | { readonly status: "refused"; readonly reason: string }
  | { readonly status: "ready"; readonly version: string; readonly notes: readonly string[] };

export function judgeRelease(input: {
  readonly workspaceRoot: string;
  readonly bump: ReleaseBump | null;
}): JudgeReleaseResult {
  const { workspaceRoot, bump } = input;
  if (bump === null) {
    return { status: "needs-bump" };
  }
  const branch = git(workspaceRoot, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  if (branch !== "main") {
    return { status: "refused", reason: `Branch is ${branch}, not main.` };
  }
  const dirtyReason = uncommittedChangesReason(workspaceRoot);
  if (dirtyReason !== null) {
    return { status: "refused", reason: dirtyReason };
  }
  const packages = listReleasePackages(workspaceRoot);
  const notesByPackage = packages.map((pkg) => readUnreleasedNotes(pkg));
  const notesAreEmpty =
    notesByPackage.length === 0 || notesByPackage.every((notes) => notes.length === 0);
  if (notesAreEmpty) {
    return { status: "refused", reason: "Release notes are empty." };
  }
  const sharedNotes = notesByPackage[0] ?? [];
  const notesDiffer = notesByPackage.some((notes) => !sameNotes(notes, sharedNotes));
  if (notesDiffer) {
    return { status: "refused", reason: "Unreleased notes differ across Release packages." };
  }
  if (hasPendingChangeset(workspaceRoot)) {
    return { status: "refused", reason: "A Changeset is already pending." };
  }
  const fixedReason = fixedGroupReason(
    workspaceRoot,
    packages.map((pkg) => pkg.name)
  );
  if (fixedReason !== null) {
    return { status: "refused", reason: fixedReason };
  }
  const versions = new Set(packages.map((pkg) => pkg.version));
  if (versions.size !== 1) {
    return { status: "refused", reason: "Release packages are not on one version." };
  }
  const current = packages[0]?.version ?? "";
  const next = semver.inc(current, bump);
  if (next === null) {
    return { status: "refused", reason: `Release version ${current} is not a Semver version.` };
  }
  return { status: "ready", version: next, notes: sharedNotes };
}

export function clearUnreleased(workspaceRoot: string): void {
  for (const pkg of listReleasePackages(workspaceRoot)) {
    if (!fs.existsSync(pkg.changelogPath)) {
      continue;
    }
    const current = fs.readFileSync(pkg.changelogPath, "utf8");
    const { newline, normalized } = splitNewlines(current);
    const parsed = parseChangelog(pkg.name, normalized);
    const next = renderChangelog({
      title: parsed.title,
      bullets: [],
      rest: parsed.rest,
      newline,
    });
    if (next !== current) {
      fs.writeFileSync(pkg.changelogPath, next);
    }
  }
}

export function writeReleaseChangeset(input: {
  readonly workspaceRoot: string;
  readonly bump: ReleaseBump;
}): void {
  const { workspaceRoot, bump } = input;
  const judged = judgeRelease({ workspaceRoot, bump });
  if (judged.status !== "ready") {
    const reason =
      judged.status === "needs-bump" ? "Name the bump: major, minor, or patch." : judged.reason;
    throw new Error(reason);
  }
  const names = listReleasePackages(workspaceRoot)
    .map((pkg) => pkg.name)
    .sort();
  const frontmatter = names.map((name) => `"${name}": ${bump}`).join("\n");
  const body = judged.notes.map((note) => `- ${note}`).join("\n");
  fs.writeFileSync(
    path.join(workspaceRoot, ".changeset", "release.md"),
    `---\n${frontmatter}\n---\n\n${body}\n`
  );
}

interface WorkspacePackage {
  readonly name: string;
  readonly directory: string;
  readonly version: string;
  readonly changelogPath: string;
}

export function recordReleaseNotes(input: {
  readonly workspaceRoot: string;
  readonly thread: ReleaseThread;
}): RecordReleaseNotesResult {
  if (input.thread.landed.length === 0 && input.thread.reverted.length === 0) {
    return { uncertainReverts: [] };
  }
  const packages = listReleasePackages(input.workspaceRoot);
  const loaded = packages.map((pkg) => loadChangelog(pkg));
  const applied = applyThread(
    mergeBullets(loaded.map((item) => item.parsed.bullets)),
    input.thread
  );
  for (const item of loaded) {
    const next = renderChangelog({
      title: item.parsed.title,
      bullets: applied.bullets,
      rest: item.parsed.rest,
      newline: item.newline,
    });
    if (next !== item.current) {
      fs.writeFileSync(item.pkg.changelogPath, next);
    }
  }
  return { uncertainReverts: applied.uncertainReverts };
}

function loadChangelog(pkg: WorkspacePackage): {
  readonly pkg: WorkspacePackage;
  readonly current: string;
  readonly newline: "\n" | "\r\n";
  readonly parsed: ParsedChangelog;
} {
  const current = fs.existsSync(pkg.changelogPath)
    ? fs.readFileSync(pkg.changelogPath, "utf8")
    : "";
  const { newline, normalized } = splitNewlines(current);
  return { pkg, current, newline, parsed: parseChangelog(pkg.name, normalized) };
}

function mergeBullets(lists: readonly (readonly string[])[]): string[] {
  const merged: string[] = [];
  for (const list of lists) {
    for (const bullet of list) {
      if (!merged.includes(bullet)) {
        merged.push(bullet);
      }
    }
  }
  return merged;
}

function applyThread(
  bullets: readonly string[],
  thread: ReleaseThread
): { readonly bullets: readonly string[]; readonly uncertainReverts: readonly string[] } {
  const next = [...bullets];
  const uncertainReverts: string[] = [];
  for (const revert of thread.reverted) {
    if (revert.matchesBullet === null) {
      uncertainReverts.push(revert.behavior);
      continue;
    }
    const index = next.indexOf(revert.matchesBullet);
    if (index === -1) {
      uncertainReverts.push(revert.behavior);
      continue;
    }
    next.splice(index, 1);
  }
  for (const item of thread.landed) {
    if (!isAlreadyListed(next, item)) {
      next.push(item.behavior);
    }
  }
  return { bullets: next, uncertainReverts };
}

interface ParsedChangelog {
  readonly title: string;
  readonly bullets: readonly string[];
  readonly rest: string;
}

function splitNewlines(markdown: string): {
  readonly newline: "\n" | "\r\n";
  readonly normalized: string;
} {
  const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
  return { newline, normalized: markdown.replaceAll("\r\n", "\n") };
}

function isAlreadyListed(bullets: readonly string[], landed: LandedBehavior): boolean {
  if (bullets.some((bullet) => bullet === landed.behavior)) {
    return true;
  }
  return landed.sameAs !== null && bullets.some((bullet) => bullet === landed.sameAs);
}

function parseChangelog(packageName: string, changelog: string): ParsedChangelog {
  const lines = changelog.split("\n");
  const title = lines[0]?.startsWith("# ") ? lines[0] : `# ${packageName}`;
  const body = lines.slice(lines[0]?.startsWith("# ") ? 1 : 0);
  const unreleasedAt = body.indexOf("## Unreleased");
  if (unreleasedAt === -1) {
    return { title, bullets: [], rest: trimOuterBlankLines(body.join("\n")) };
  }
  const afterHeading = body.slice(unreleasedAt + 1);
  const nextHeading = afterHeading.findIndex((line) => line.startsWith("## "));
  const section = nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading);
  const bullets = section.filter((line) => line.startsWith("- ")).map((line) => line.slice(2));
  const before = body.slice(0, unreleasedAt);
  const after = nextHeading === -1 ? [] : afterHeading.slice(nextHeading);
  return { title, bullets, rest: trimOuterBlankLines([...before, ...after].join("\n")) };
}

function renderChangelog(input: {
  readonly title: string;
  readonly bullets: readonly string[];
  readonly rest: string;
  readonly newline: "\n" | "\r\n";
}): string {
  const { title, bullets, rest, newline } = input;
  const parts = [title];
  if (bullets.length > 0) {
    parts.push("", "## Unreleased", "", ...bullets.map((bullet) => `- ${bullet}`), "");
  }
  if (rest.length > 0) {
    if (bullets.length === 0) {
      parts.push("");
    }
    parts.push(rest);
  }
  let rendered = parts.join("\n");
  if (!rendered.endsWith("\n")) {
    rendered = `${rendered}\n`;
  }
  return newline === "\n" ? rendered : rendered.replaceAll("\n", "\r\n");
}

function trimOuterBlankLines(value: string): string {
  return value.replace(/^\n+/, "").replace(/\n+$/, "");
}

function listReleasePackages(workspaceRoot: string): readonly WorkspacePackage[] {
  const ignore = new Set(readChangesetConfig(workspaceRoot).ignore);
  return listWorkspacePackages(workspaceRoot).filter(
    (pkg) => isReleasePackageName(pkg.name) && !ignore.has(pkg.name)
  );
}

function isReleasePackageName(name: string): boolean {
  return name.startsWith("@m5kdev/") || name === "create-m5kdev";
}

interface ChangesetConfig {
  readonly ignore: readonly string[];
  readonly fixed: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function nestedStringList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((group) => stringList(group));
}

function readChangesetConfig(workspaceRoot: string): ChangesetConfig {
  const configPath = path.join(workspaceRoot, ".changeset", "config.json");
  const parsed: unknown = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (!isRecord(parsed)) {
    throw new Error("Changeset config is not an object.");
  }
  return {
    ignore: stringList(parsed.ignore),
    fixed: nestedStringList(parsed.fixed),
  };
}

function listWorkspacePackages(workspaceRoot: string): readonly WorkspacePackage[] {
  const packages: WorkspacePackage[] = [];
  collectPackages(path.join(workspaceRoot, "packages"), packages);
  collectPackages(path.join(workspaceRoot, "apps"), packages);
  return packages;
}

function collectPackages(directory: string, packages: WorkspacePackage[]): void {
  if (!fs.existsSync(directory)) {
    return;
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }
    const full = path.join(directory, entry.name);
    const manifestPath = path.join(full, "package.json");
    if (fs.existsSync(manifestPath)) {
      const parsed: unknown = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (
        !isRecord(parsed) ||
        typeof parsed.name !== "string" ||
        typeof parsed.version !== "string"
      ) {
        collectPackages(full, packages);
        continue;
      }
      packages.push({
        name: parsed.name,
        directory: full,
        version: parsed.version,
        changelogPath: path.join(full, "CHANGELOG.md"),
      });
    }
    collectPackages(full, packages);
  }
}

function readUnreleasedNotes(pkg: WorkspacePackage): readonly string[] {
  if (!fs.existsSync(pkg.changelogPath)) {
    return [];
  }
  return parseChangelog(
    pkg.name,
    fs.readFileSync(pkg.changelogPath, "utf8").replaceAll("\r\n", "\n")
  ).bullets;
}

function sameNotes(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((note, index) => note === right[index]);
}

function hasPendingChangeset(workspaceRoot: string): boolean {
  const directory = path.join(workspaceRoot, ".changeset");
  return fs.readdirSync(directory).some((file) => file.endsWith(".md") && file !== "README.md");
}

function fixedGroupReason(workspaceRoot: string, releaseNames: readonly string[]): string | null {
  const fixed = readChangesetConfig(workspaceRoot).fixed;
  const release = new Set(releaseNames);
  const grouped = new Set(fixed);
  const missing = [...releaseNames].filter((name) => !grouped.has(name)).sort();
  if (missing.length > 0) {
    return `Fixed group is missing ${missing.join(", ")}.`;
  }
  const extra = fixed.filter((name) => !release.has(name)).sort();
  if (extra.length > 0) {
    return `Fixed group includes ${extra.join(", ")}, which is not in the Release.`;
  }
  return null;
}

function uncommittedChangesReason(workspaceRoot: string): string | null {
  const status = git(workspaceRoot, ["status", "--porcelain"]).replace(/\n$/, "");
  if (status.trim().length === 0) {
    return null;
  }
  const changelogs = new Set(
    listReleasePackages(workspaceRoot).map((pkg) => path.relative(workspaceRoot, pkg.changelogPath))
  );
  const blocked: string[] = [];
  for (const line of status.split("\n")) {
    const file = porcelainPath(line);
    if (!changelogs.has(file) || !isUnreleasedOnlyChange(workspaceRoot, file)) {
      blocked.push(file);
    }
  }
  if (blocked.length === 0) {
    return null;
  }
  return `Uncommitted changes are not Unreleased changelog edits: ${blocked.join(", ")}`;
}

function isUnreleasedOnlyChange(workspaceRoot: string, relativePath: string): boolean {
  const current = fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
  let previous = "";
  try {
    previous = git(workspaceRoot, ["show", `HEAD:${relativePath}`]);
  } catch {
    previous = "";
  }
  return changelogWithoutNotes(previous) === changelogWithoutNotes(current);
}

function changelogWithoutNotes(markdown: string): string {
  const parsed = parseChangelog("package", splitNewlines(markdown).normalized);
  return `${parsed.title}\n${parsed.rest}`;
}

function porcelainPath(line: string): string {
  const trimmed = line.trimEnd();
  const match = /^.. (.*)$/.exec(trimmed);
  return match?.[1] ?? trimmed;
}

function git(workspaceRoot: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd: workspaceRoot,
    encoding: "utf8",
  });
}
