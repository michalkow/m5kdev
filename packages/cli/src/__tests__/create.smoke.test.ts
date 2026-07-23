import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { scaffoldProject } from "../create";
import { diagnoseManagedRepo } from "../doctor";

const execFileAsync = promisify(execFile);
const maybeDescribe = process.env.CLI_SMOKE === "1" ? describe : describe.skip;
const SMOKE_TEST_TIMEOUT_MS = 10 * 60 * 1000;

maybeDescribe("create command smoke test", () => {
  let tempRoot = "";
  let initialCwd = "";

  beforeAll(async () => {
    initialCwd = process.cwd();
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-cli-smoke-"));
    process.chdir(tempRoot);
  });

  afterAll(async () => {
    process.chdir(initialCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }, SMOKE_TEST_TIMEOUT_MS);

  it(
    "scaffolds a project and runs the generated commands",
    async () => {
      const result = await scaffoldProject({
        targetDirectory: "smoke-app",
        appName: "Smoke App",
        appDescription: "Smoke test app",
        yes: true,
        force: false,
        skipInstall: false,
        skipGit: true,
      });

      await expect(
        diagnoseManagedRepo({ repoRoot: result.targetDirectory })
      ).resolves.toMatchObject({
        ok: true,
      });

      await execFileAsync("pnpm", ["--filter", "./apps/server", "generate:schema"], {
        cwd: result.targetDirectory,
        env: process.env,
      });
      await execFileAsync("pnpm", ["check-types"], {
        cwd: result.targetDirectory,
        env: process.env,
      });
      await execFileAsync("pnpm", ["lint"], {
        cwd: result.targetDirectory,
        env: process.env,
      });
      await execFileAsync("pnpm", ["--filter", "./apps/server", "sync"], {
        cwd: result.targetDirectory,
        env: process.env,
      });
      await execFileAsync("pnpm", ["--filter", "./apps/server", "build"], {
        cwd: result.targetDirectory,
        env: process.env,
      });
      await execFileAsync("pnpm", ["--filter", "./apps/webapp", "build"], {
        cwd: result.targetDirectory,
        env: process.env,
      });
    },
    SMOKE_TEST_TIMEOUT_MS
  );
});
