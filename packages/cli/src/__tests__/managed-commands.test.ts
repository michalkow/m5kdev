import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { scaffoldProject } from "../create";
import { diagnoseManagedRepo } from "../doctor";
import { initializeManagedRepo } from "../init";
import { runCli } from "../runCli";
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

  it("reports missing installation without confusing it with source compatibility", async () => {
    const report = await diagnoseManagedRepo({ repoRoot });
    expect(report.ok).toBe(false);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code: "DEPENDENCY_MISSING" })
    );
    const source = await diagnoseManagedRepo({ repoRoot, checkInstallation: false });
    expect(source.ok).toBe(true);
    expect(source.verification).toContainEqual(
      expect.objectContaining({
        id: "dependencies:package.json",
        status: "configured-but-untested",
      })
    );
  });

  it("reports installed version drift and missing package executables instead of trusting declarations", async () => {
    const packagePath = path.join(repoRoot, "package.json");
    const manifest = JSON.parse(await fs.readFile(packagePath, "utf8"));
    manifest.dependencies = { "upgrade-fixture": "1.2.3" };
    await fs.writeFile(packagePath, JSON.stringify(manifest));
    const installed = path.join(repoRoot, "node_modules/upgrade-fixture");
    await fs.mkdir(installed, { recursive: true });
    await fs.writeFile(
      path.join(installed, "package.json"),
      JSON.stringify({
        name: "upgrade-fixture",
        version: "1.0.0",
        bin: { "upgrade-tool": "dist/cli.js" },
      })
    );
    const report = await diagnoseManagedRepo({ repoRoot });
    expect(report.ok).toBe(false);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "INSTALLED_VERSION_MISMATCH", path: "package.json" }),
        expect.objectContaining({ code: "EXECUTABLE_MISSING" }),
      ])
    );
    expect(report.verification).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "dependencies:package.json", status: "blocked" }),
      ])
    );
  });

  it("finds Windows executables through PATHEXT, including git.exe", async () => {
    const commands = path.join(tempRoot, "commands");
    await fs.mkdir(commands);
    await fs.writeFile(path.join(commands, "git.exe"), "fixture executable");
    await fs.writeFile(path.join(commands, "pnpm.cmd"), "fixture command shim");
    const platform = Object.getOwnPropertyDescriptor(process, "platform");
    if (!platform) throw new Error("Missing process.platform descriptor");
    const previousPath = process.env.PATH;
    const previousExtensions = process.env.PATHEXT;
    try {
      Object.defineProperty(process, "platform", { value: "win32" });
      process.env.PATH = commands;
      process.env.PATHEXT = ".COM;.EXE;.BAT;.CMD";
      const report = await diagnoseManagedRepo({ repoRoot });
      expect(report.verification).toContainEqual(
        expect.objectContaining({ id: "executables", status: "verified" })
      );
      expect(report.diagnostics).not.toContainEqual(
        expect.objectContaining({
          code: "EXECUTABLE_MISSING",
          message: expect.stringContaining("Required commands"),
        })
      );
    } finally {
      Object.defineProperty(process, "platform", platform);
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      if (previousExtensions === undefined) delete process.env.PATHEXT;
      else process.env.PATHEXT = previousExtensions;
    }
  });

  it("initializes an existing compatible project at the running baseline", async () => {
    await fs.rm(path.join(repoRoot, ".m5kdev.json"));
    const result = await initializeManagedRepo({ repoRoot, yes: true, force: false });
    expect(result.initialized).toBe(true);
    expect(await readManagedState(repoRoot)).toEqual(result.state);
  });

  it("enrolls source without requiring local database secrets", async () => {
    await fs.rm(path.join(repoRoot, ".m5kdev.json"));
    await fs.rm(path.join(repoRoot, "apps/shared/.env"));
    const result = await initializeManagedRepo({ repoRoot, yes: true, force: false });
    expect(result.initialized).toBe(true);
    expect(result.report.ok).toBe(true);
    expect(result.report.verification).toContainEqual(
      expect.objectContaining({ id: "runtime-configuration", status: "configured-but-untested" })
    );
    const runtime = await diagnoseManagedRepo({ repoRoot });
    expect(runtime.diagnostics).toContainEqual(
      expect.objectContaining({ code: "CONFIGURATION_MISSING", path: "apps/shared/.env" })
    );
  });

  it("separates missing migration configuration from configured but untested CI and deployment", async () => {
    await fs.rm(path.join(repoRoot, "apps/server/drizzle.config.ts"));
    const report = await diagnoseManagedRepo({ repoRoot });
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "CONFIGURATION_MISSING",
        path: "apps/server/drizzle.config.ts",
      })
    );
    expect(report.verification).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "migrations", status: "blocked" }),
        expect.objectContaining({ id: "ci", status: "configured-but-untested" }),
        expect.objectContaining({ id: "deployment", status: "configured-but-untested" }),
        expect.objectContaining({ id: "documentation", status: "configured-but-untested" }),
      ])
    );
  });

  it.each([
    { argument: "--project missing-project.json", file: "missing-project.json" },
    { argument: "-p missing-project.json", file: "missing-project.json" },
    { argument: "--project=missing-project.json", file: "missing-project.json" },
    { argument: '--project "missing project.json"', file: "missing project.json" },
  ])("detects explicit TypeScript config dependencies: $argument", async ({ argument, file }) => {
    const packagePath = path.join(repoRoot, "package.json");
    const manifest = JSON.parse(await fs.readFile(packagePath, "utf8"));
    manifest.scripts["check-types"] = `tsc ${argument}`;
    await fs.writeFile(packagePath, JSON.stringify(manifest));
    const report = await diagnoseManagedRepo({ repoRoot, checkInstallation: false });
    expect(report.ok).toBe(false);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code: "CONFIGURATION_MISSING", path: file })
    );
    expect(report.verification).toContainEqual(
      expect.objectContaining({ id: "build-configuration", status: "blocked" })
    );
  });

  it("records full command evidence and reports missing scripts instead of silently skipping them", async () => {
    const file = path.join(repoRoot, "package.json");
    const manifest = JSON.parse(await fs.readFile(file, "utf8"));
    manifest.scripts = {
      ...manifest.scripts,
      "check-types": 'node -e "process.exit(0)"',
      build: 'node -e "process.exit(1)"',
      "docs:build": 'node -e "process.exit(0)"',
    };
    delete manifest.scripts.lint;
    await fs.writeFile(file, JSON.stringify(manifest));
    const report = await diagnoseManagedRepo({ repoRoot, full: true, checkInstallation: false });
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "COMMAND_LINT_MISSING" }),
        expect.objectContaining({ code: "COMMAND_BUILD_FAILED" }),
      ])
    );
    expect(report.verification).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "command:check-types",
          status: "verified",
          evidence: ["pnpm check-types completed successfully."],
        }),
        expect.objectContaining({ id: "command:lint", status: "blocked" }),
        expect.objectContaining({ id: "command:build", status: "blocked" }),
        expect.objectContaining({ id: "command:docs:build", status: "verified" }),
        expect.objectContaining({ id: "deployment", status: "configured-but-untested" }),
      ])
    );
  });

  it("reports current executable readiness when the full build repairs a linked package", async () => {
    const packagePath = path.join(repoRoot, "package.json");
    const manifest = JSON.parse(await fs.readFile(packagePath, "utf8"));
    manifest.dependencies = { "upgrade-fixture": "1.0.0" };
    manifest.devDependencies = {};
    manifest.scripts = {
      ...manifest.scripts,
      "check-types": 'node -e "process.exit(0)"',
      lint: 'node -e "process.exit(0)"',
      build: "node build-fixture.cjs",
      "docs:build": 'node -e "process.exit(0)"',
    };
    await fs.writeFile(packagePath, JSON.stringify(manifest));
    const installed = path.join(repoRoot, "node_modules/upgrade-fixture");
    await fs.mkdir(installed, { recursive: true });
    await fs.writeFile(
      path.join(installed, "package.json"),
      JSON.stringify({
        name: "upgrade-fixture",
        version: "1.0.0",
        bin: { "upgrade-tool": "dist/cli.js" },
      })
    );
    await fs.writeFile(
      path.join(repoRoot, "build-fixture.cjs"),
      [
        'const fs = require("node:fs");',
        'fs.mkdirSync("node_modules/upgrade-fixture/dist", { recursive: true });',
        'fs.writeFileSync("node_modules/upgrade-fixture/dist/cli.js", "module.exports = {};");',
        'fs.mkdirSync("node_modules/.bin", { recursive: true });',
        'fs.writeFileSync("node_modules/.bin/upgrade-tool", "#!/bin/sh\\nexit 0\\n", { mode: 0o755 });',
      ].join("\n")
    );
    const before = await diagnoseManagedRepo({ repoRoot });
    expect(before.verification).toContainEqual(
      expect.objectContaining({ id: "dependencies:package.json", status: "blocked" })
    );
    const after = await diagnoseManagedRepo({ repoRoot, full: true });
    expect(after.verification).toContainEqual(
      expect.objectContaining({ id: "dependencies:package.json", status: "verified" })
    );
  });

  it("does not require catalog entries belonging only to disabled features", async () => {
    await fs.rm(path.join(repoRoot, ".m5kdev.json"));
    const workspacePath = path.join(repoRoot, "pnpm-workspace.yaml");
    const workspace = await fs.readFile(workspacePath, "utf8");
    await fs.writeFile(workspacePath, workspace.replace(/^ {2}react-native-web:.*\n/m, ""), "utf8");

    const result = await initializeManagedRepo({ repoRoot, yes: true, force: false });
    expect(result.initialized).toBe(true);
    expect(result.state.template.features).toEqual(["docs-landing", "webapp"]);
    expect(result.state.catalog).not.toHaveProperty("react-native-web");
    expect(result.report.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "CATALOG_ENTRY_MISSING" })
    );
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

  it.each(["doctor", "update"])(
    "exposes verification evidence through %s JSON output",
    async (command) => {
      process.chdir(repoRoot);
      const previousExitCode = process.exitCode;
      const output = jest.spyOn(console, "log").mockImplementation(() => undefined);
      try {
        await runCli(
          command === "doctor" ? ["doctor", "--json"] : ["update", "--dry-run", "--json"]
        );
        const report = JSON.parse(String(output.mock.calls[0]?.[0]));
        expect(report.verification.length).toBeGreaterThan(0);
        if (command === "doctor") {
          expect(report.ok).toBe(false);
          expect(report.verification).toContainEqual(
            expect.objectContaining({ status: "blocked" })
          );
        } else {
          expect(report.applied).toBe(false);
          expect(report.preflight.diagnostics).toContainEqual(
            expect.objectContaining({ code: "DEPENDENCY_MISSING" })
          );
          expect(report.verification).toContainEqual(
            expect.objectContaining({ id: "upgrade-full", status: "configured-but-untested" })
          );
        }
      } finally {
        output.mockRestore();
        process.exitCode = previousExitCode;
      }
    }
  );

  it("labels verified, configured but untested, and blocked checks in text output", async () => {
    process.chdir(repoRoot);
    const previousExitCode = process.exitCode;
    const output = jest.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await runCli(["doctor"]);
      const lines = output.mock.calls.flat().map(String);
      expect(lines).toEqual(
        expect.arrayContaining(["Verified:", "Configured but untested:", "Blocked:"])
      );
    } finally {
      output.mockRestore();
      process.exitCode = previousExitCode;
    }
  });
});

describe("landing-only managed repository commands", () => {
  let tempRoot: string;
  let initialCwd: string;
  let repoRoot: string;

  beforeEach(async () => {
    initialCwd = process.cwd();
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-landing-managed-"));
    process.chdir(tempRoot);
    repoRoot = (
      await scaffoldProject({
        targetDirectory: "fixture",
        appName: "Landing Fixture",
        appDescription: "Landing-only managed fixture.",
        platform: "landing",
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

  it("checks a landing-only source baseline without inventing a database", async () => {
    const report = await diagnoseManagedRepo({ repoRoot, checkInstallation: false });
    expect(report.ok).toBe(true);
    expect(report.diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
  });

  it("initializes a landing-only tree without Deploy home constants", async () => {
    await fs.rm(path.join(repoRoot, ".m5kdev.json"));
    const result = await initializeManagedRepo({ repoRoot, yes: true, force: false });
    expect(result.initialized).toBe(true);
    expect(result.state.template.features).toEqual(["docs-landing"]);
    expect(result.state.template.context.appName.length).toBeGreaterThan(0);
  });
});
