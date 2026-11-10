import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { scaffoldProject } from "../create";

type Workflow = {
  on: { pull_request?: { branches: string[] } };
  jobs: Record<string, { steps: { id?: string; name?: string; run?: string }[] }>;
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function runScript(cwd: string, script: string, env: Record<string, string>) {
  const output = path.join(cwd, ".github-output");
  rmSync(output, { force: true });
  const result = spawnSync("bash", ["-e", "-c", script], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env, GITHUB_OUTPUT: output },
  });
  return {
    status: result.status,
    stderr: result.stderr,
    output: existsSync(output) ? readFileSync(output, "utf8") : "",
  };
}

describe("Promotion PRs", () => {
  let tempRoot = "";
  let initialCwd = "";
  const workflows: Record<string, Workflow> = {};

  beforeAll(async () => {
    initialCwd = process.cwd();
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-promotion-"));
    process.chdir(tempRoot);
    const result = await scaffoldProject({
      targetDirectory: "promotion-app",
      appName: "Promotion App",
      appDescription: "Promotion fixture.",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    });
    for (const name of ["promotion.yml", "deploy-app.yml"]) {
      workflows[name] = parse(
        await fs.readFile(path.join(result.targetDirectory, ".github/workflows", name), "utf8")
      ) as Workflow;
    }
  });

  afterAll(async () => {
    process.chdir(initialCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const promotionScript = () =>
    workflows["promotion.yml"]?.jobs.check?.steps.find((step) => step.run)?.run ?? "";

  it("accepts a PR into production only from main", () => {
    expect(workflows["promotion.yml"]?.on.pull_request?.branches).toEqual(["production"]);
    const check = (head: string) =>
      runScript(tempRoot, promotionScript(), {
        GITHUB_BASE_REF: "production",
        GITHUB_HEAD_REF: head,
      });

    expect(check("main").status).toBe(0);
    const feature = check("feature/login");
    expect(feature.status).not.toBe(0);
    expect(feature.stderr).toContain("main");
  });

  describe("tree check before deploying a release branch", () => {
    let origin = "";
    let work = "";
    const resolveScript = () =>
      workflows["deploy-app.yml"]?.jobs.resolve?.steps.find((step) => step.id === "environment")
        ?.run ?? "";

    beforeEach(async () => {
      origin = await fs.mkdtemp(path.join(tempRoot, "origin-"));
      work = await fs.mkdtemp(path.join(tempRoot, "work-"));
      git(origin, "init", "-q", "--bare", "-b", "main");
      git(work, "init", "-q", "-b", "main");
      git(work, "config", "user.email", "ci@example.test");
      git(work, "config", "user.name", "CI");
      git(work, "remote", "add", "origin", origin);
      await fs.writeFile(path.join(work, "app.txt"), "v1\n");
      git(work, "add", "-A");
      git(work, "commit", "-qm", "v1");
      git(work, "push", "-q", "origin", "main");
      git(work, "switch", "-qc", "production");
      // a later main commit that production has not been promoted to yet
      git(work, "switch", "-q", "main");
      await fs.writeFile(path.join(work, "app.txt"), "v2\n");
      git(work, "commit", "-qam", "v2");
      git(work, "push", "-q", "origin", "main");
      git(work, "switch", "-q", "production");
    });

    it("deploys a merge commit whose tree matches a tested main commit", () => {
      git(work, "merge", "-q", "--no-ff", "-m", "Promote main", "main");

      const result = runScript(work, resolveScript(), { GITHUB_REF_NAME: "production" });

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.output).toContain("environment=production");
    });

    it("refuses a release branch carrying a commit that never reached main", async () => {
      git(work, "merge", "-q", "--no-ff", "-m", "Promote main", "main");
      await fs.writeFile(path.join(work, "app.txt"), "hotfix\n");
      git(work, "commit", "-qam", "direct hotfix");

      const result = runScript(work, resolveScript(), { GITHUB_REF_NAME: "production" });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Promotion PR from main");
    });

    it("skips the check for main itself", () => {
      git(work, "switch", "-q", "main");
      const result = runScript(work, resolveScript(), { GITHUB_REF_NAME: "main" });

      expect(result.status).toBe(0);
      expect(result.output).toContain("environment=development");
    });
  });
});
