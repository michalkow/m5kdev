import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { scaffoldProject } from "../create";
import { diagnoseManagedRepo } from "../doctor";
import { initializeManagedRepo } from "../init";
import { readManagedState } from "../state";

describe("managed repository commands", () => {
  let tempRoot: string;
  let initialCwd: string;
  let repoRoot: string;

  beforeEach(async () => {
    initialCwd = process.cwd();
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-managed-"));
    process.chdir(tempRoot);
    repoRoot = (
      await scaffoldProject({
        targetDirectory: "fixture",
        appName: "Managed Fixture",
        appDescription: "Managed command fixture.",
        platform: "web",
        testHarness: false,
        yes: true,
        force: false,
        skipInstall: true,
        skipGit: true,
      })
    ).targetDirectory;
  });

  afterEach(async () => {
    process.chdir(initialCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("reports a freshly scaffolded repository as healthy", async () => {
    const report = await diagnoseManagedRepo({ repoRoot });
    expect(report.ok).toBe(true);
    expect(report.diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
  });

  it("initializes an existing compatible project at the running baseline", async () => {
    await fs.rm(path.join(repoRoot, ".m5kdev.json"));
    const result = await initializeManagedRepo({ repoRoot, yes: true, force: false });
    expect(result.initialized).toBe(true);
    expect(await readManagedState(repoRoot)).toEqual(result.state);
  });

  it("requires explicit confirmation and refuses an existing state without force", async () => {
    await expect(initializeManagedRepo({ repoRoot, yes: true, force: false })).rejects.toThrow(
      "already exists"
    );
    await fs.rm(path.join(repoRoot, ".m5kdev.json"));
    await expect(initializeManagedRepo({ repoRoot, yes: false, force: false })).rejects.toThrow(
      "requires confirmation"
    );
  });

  it("force re-baselines existing state without changing application files", async () => {
    const packagePath = path.join(repoRoot, "package.json");
    const before = await fs.readFile(packagePath);
    const statePath = path.join(repoRoot, ".m5kdev.json");
    const stale = JSON.parse(await fs.readFile(statePath, "utf8")) as {
      appliedMigrations: string[];
    };
    stale.appliedMigrations = ["stale-id"];
    await fs.writeFile(statePath, `${JSON.stringify(stale)}\n`);
    const result = await initializeManagedRepo({ repoRoot, yes: true, force: true });
    expect(result.initialized).toBe(true);
    expect(result.state.appliedMigrations).toEqual([]);
    expect(await fs.readFile(packagePath)).toEqual(before);
  });

  it("uses stable diagnostics for missing paths, tokens, and conflicts", async () => {
    await fs.rm(path.join(repoRoot, "apps/server/package.json"));
    await fs.appendFile(path.join(repoRoot, "README.md"), "\n{{APP_NAME}}\n<<<<<<< local\n");
    const report = await diagnoseManagedRepo({ repoRoot });
    expect(report.ok).toBe(false);
    expect(report.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "REQUIRED_PATH_MISSING",
        "UNRESOLVED_TEMPLATE_TOKEN",
        "MERGE_CONFLICT_MARKER",
      ])
    );
  });
});
