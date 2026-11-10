import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runMigrationCheck } from "./migration-check";

const folder = "apps/server/drizzle-postgresql";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

async function writeMigration(
  root: string,
  entries: { tag: string; when: number }[],
  files: Record<string, string>
): Promise<void> {
  await mkdir(path.join(root, folder, "meta"), { recursive: true });
  await writeFile(
    path.join(root, folder, "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "postgresql",
      entries: entries.map((entry, idx) => ({ idx, version: "7", breakpoints: true, ...entry })),
    })
  );
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(root, folder, name), content);
  }
}

describe("m5kdev-migration-check", () => {
  let root = "";
  const base = [{ tag: "0000_base", when: 1 }];

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "m5kdev-migration-check-"));
    git(root, "init", "-q", "-b", "main");
    git(root, "config", "user.email", "ci@example.test");
    git(root, "config", "user.name", "CI");
    await writeMigration(root, base, {
      "0000_base.sql": "CREATE TABLE a (id text);",
      "meta/0000_snapshot.json": "{}",
    });
    git(root, "add", "-A");
    git(root, "commit", "-qm", "base");
    git(root, "switch", "-qc", "feature");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("fails when an already-merged migration's SQL was edited", async () => {
    await writeFile(path.join(root, folder, "0000_base.sql"), "CREATE TABLE a (id text, x int);");
    git(root, "commit", "-qam", "edit merged migration");

    const result = runMigrationCheck({ cwd: root, folder, base: "main" });

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toMatch(/0000_base\.sql.*frozen/);
  });

  it("allows a new migration appended to the history", async () => {
    await writeMigration(root, [...base, { tag: "0001_next", when: 2 }], {
      "0001_next.sql": "CREATE TABLE b (id text);",
      "meta/0001_snapshot.json": "{}",
    });
    git(root, "add", "-A");
    git(root, "commit", "-qm", "new migration");

    expect(runMigrationCheck({ cwd: root, folder, base: "main" })).toEqual({
      ok: true,
      problems: [],
    });
  });

  it("fails when a merged journal entry is rewritten", async () => {
    await writeMigration(root, [{ tag: "0000_base", when: 5 }], {});
    git(root, "commit", "-qam", "rewrite journal");

    const result = runMigrationCheck({ cwd: root, folder, base: "main" });

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toMatch(/0000_base.*journal/);
  });

  it("fails when drizzle:generate left migration files that are not committed", async () => {
    // What drizzle:generate writes when a table definition changed without a migration.
    await writeMigration(root, [...base, { tag: "0001_forgotten", when: 2 }], {
      "0001_forgotten.sql": "ALTER TABLE a ADD COLUMN y text;",
    });

    const result = runMigrationCheck({ cwd: root, folder, base: "main" });

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toMatch(/out of sync.*drizzle:generate/s);
    expect(result.problems.join("\n")).toContain("0001_forgotten.sql");
  });
});
