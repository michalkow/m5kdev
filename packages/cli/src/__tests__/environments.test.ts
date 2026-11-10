import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { scaffoldProject } from "../create";
import { diagnoseManagedRepo } from "../doctor";
import { runCli } from "../runCli";

const combinations = [
  { environments: [], branches: ["main", "production"] },
  { environments: ["canary"], branches: ["main", "canary", "production"] },
  { environments: ["staging"], branches: ["main", "staging", "production"] },
  { environments: ["staging", "canary"], branches: ["main", "staging", "canary", "production"] },
] as const;

const OPTIONAL = ["staging", "canary"] as const;

describe("optional Deployment environments", () => {
  let tempRoot = "";
  let initialCwd = "";

  beforeEach(async () => {
    initialCwd = process.cwd();
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-environments-"));
    process.chdir(tempRoot);
  });

  afterEach(async () => {
    process.chdir(initialCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it.each(combinations)(
    "scaffolds the files and branches for $environments",
    async ({ environments, branches }) => {
      const result = await scaffoldProject({
        targetDirectory: "env-app",
        appName: "Env App",
        appDescription: "Optional environments fixture.",
        environments: [...environments],
        yes: true,
        force: false,
        skipInstall: true,
        skipGit: true,
      });
      const exists = (relative: string) =>
        fs.stat(path.join(result.targetDirectory, relative)).then(
          () => true,
          () => false
        );
      const read = (relative: string) =>
        fs.readFile(path.join(result.targetDirectory, relative), "utf8");
      const rootPackage = JSON.parse(await read("package.json")) as {
        scripts: Record<string, string>;
      };

      for (const environment of OPTIONAL) {
        const enabled = (environments as readonly string[]).includes(environment);
        expect(await exists(`apps/shared/fly.${environment}.toml`)).toBe(enabled);
        expect(await exists(`apps/shared/.env.${environment}.example`)).toBe(enabled);
        expect(rootPackage.scripts[`app:deploy:${environment}`] !== undefined).toBe(enabled);
        if (enabled) {
          expect(await read(`apps/shared/fly.${environment}.toml`)).toContain(
            `app = "env-app-${environment}"`
          );
          expect(await read(`apps/shared/.env.${environment}.example`)).toMatch(
            new RegExp(`^APP_ENV=${environment}$`, "m")
          );
          expect(await read(`apps/shared/.env.${environment}.example`)).toMatch(
            /^APP_SLUG=env-app$/m
          );
          expect(await read("docs/deployment.md")).toContain(`env-app-${environment}`);
        }
      }

      for (const file of [
        ".github/workflows/deploy-app.yml",
        ".github/workflows/promotion.yml",
        "docs/deployment.md",
        "docs/agents/environments.md",
        ".gitignore",
        "package.json",
      ]) {
        expect(await read(file)).not.toContain("m5k:");
      }
      const report = await diagnoseManagedRepo({ repoRoot: result.targetDirectory });
      expect(report.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      const deploy = parse(await read(".github/workflows/deploy-app.yml"));
      expect(deploy.on.push.branches).toEqual(branches);
      const promotion = parse(await read(".github/workflows/promotion.yml"));
      expect(promotion.on.pull_request.branches).toEqual(branches.slice(1));
    }
  );

  it.each(combinations)(
    "accepts Promotion PRs only from the previous branch for $environments",
    async ({ environments, branches }) => {
      const result = await scaffoldProject({
        targetDirectory: "chain-app",
        appName: "Chain App",
        appDescription: "Promotion chain fixture.",
        environments: [...environments],
        yes: true,
        force: false,
        skipInstall: true,
        skipGit: true,
      });
      const promotion = parse(
        await fs.readFile(
          path.join(result.targetDirectory, ".github/workflows/promotion.yml"),
          "utf8"
        )
      );
      const script: string = promotion.jobs.check.steps.find(
        (step: { run?: string }) => step.run
      ).run;
      const accepts = (base: string, head: string) =>
        spawnSync("bash", ["-e", "-c", script], {
          env: { ...process.env, GITHUB_BASE_REF: base, GITHUB_HEAD_REF: head },
        }).status === 0;

      for (let index = 1; index < branches.length; index += 1) {
        const base = branches[index]!;
        for (const head of branches) {
          expect(accepts(base, head)).toBe(head === branches[index - 1]);
        }
        expect(accepts(base, "feature/x")).toBe(false);
      }
    }
  );

  it("adds Canary to an existing app with update, matching a Canary scaffold", async () => {
    const { updateManagedRepo } = await import("../update");
    const options = {
      appName: "Grow App",
      appDescription: "Update fixture.",
      yes: true,
      force: false,
      skipInstall: true,
      skipGit: true,
    };
    const existing = await scaffoldProject({ ...options, targetDirectory: "grow-app" });
    const expected = await scaffoldProject({
      ...options,
      targetDirectory: "grow-app-canary",
      environments: ["canary"],
    });

    const update = await updateManagedRepo({
      repoRoot: existing.targetDirectory,
      dryRun: false,
      skipInstall: true,
      yes: true,
      environments: ["canary"],
      assertClean: async () => undefined,
      install: async () => undefined,
    });

    expect(update.applied).toBe(true);
    expect(update.conflicts).toEqual([]);
    for (const file of [
      "apps/shared/fly.canary.toml",
      "apps/shared/.env.canary.example",
      ".github/workflows/deploy-app.yml",
      ".github/workflows/promotion.yml",
      "docs/deployment.md",
      "docs/agents/environments.md",
      ".gitignore",
      "package.json",
    ]) {
      const read = (root: string) => fs.readFile(path.join(root, file), "utf8");
      expect(await read(existing.targetDirectory)).toBe(await read(expected.targetDirectory));
    }
    const state = JSON.parse(
      await fs.readFile(path.join(existing.targetDirectory, ".m5kdev.json"), "utf8")
    ) as { template: { features: string[] } };
    expect(state.template.features).toContain("env-canary");
  });

  it("takes --environments on create and rejects unknown names", async () => {
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    await runCli([
      "create",
      "flag-app",
      "--yes",
      "--skip-install",
      "--skip-git",
      "--environments",
      "canary",
    ]);
    await expect(
      fs.stat(path.join(tempRoot, "flag-app/apps/shared/fly.canary.toml"))
    ).resolves.toBeTruthy();
    await expect(
      fs.stat(path.join(tempRoot, "flag-app/apps/shared/fly.staging.toml"))
    ).rejects.toMatchObject({ code: "ENOENT" });

    await expect(
      runCli(["create", "bad-app", "--yes", "--skip-install", "--skip-git", "--environments", "qa"])
    ).rejects.toThrow(/Unknown Deployment environment "qa"/);
  });
});
