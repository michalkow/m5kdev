import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parse } from "yaml";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(__dirname, "../../../..");
const maybeDescribe = process.env.CLI_AUTH_SMOKE === "1" ? describe : describe.skip;

maybeDescribe("fresh consumer auth installation", () => {
  it("loads the Kernel auth dependencies without relying on the monorepo lockfile", async () => {
    const backend = JSON.parse(
      await fs.readFile(path.join(repoRoot, "packages/backend/package.json"), "utf8")
    );
    const workspace = parse(await fs.readFile(path.join(repoRoot, "pnpm-workspace.yaml"), "utf8"));
    const version = workspace.catalog["better-auth"];
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-auth-install-"));
    try {
      // Keep the real package boundary and auth dependency declarations, without
      // installing unrelated Kernel integrations or inheriting workspace overrides.
      await fs.mkdir(path.join(directory, "kernel"));
      await fs.writeFile(
        path.join(directory, "kernel/package.json"),
        JSON.stringify({
          name: "auth-kernel-fixture",
          version: "1.0.0",
          type: "module",
          exports: "./index.mjs",
          dependencies: Object.fromEntries(
            Object.entries(backend.dependencies).filter(([name]) =>
              name.startsWith("@better-auth/")
            )
          ),
          peerDependencies: { "better-auth": version },
        })
      );
      await fs.writeFile(
        path.join(directory, "kernel/index.mjs"),
        `import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import "@better-auth/api-key";
import "@better-auth/cimd";
import "@better-auth/cimd/node";
import "@better-auth/mcp";

// Check MCP's own resolution, not just a direct provider installed beside it.
const requireFromMcp = createRequire(import.meta.resolve("@better-auth/mcp"));
const provider = pathToFileURL(requireFromMcp.resolve("@better-auth/oauth-provider"));
const manifest = JSON.parse(readFileSync(new URL("../package.json", provider), "utf8"));
assert.equal(manifest.version, ${JSON.stringify(version)});
console.log("Kernel auth imports OK");
`
      );
      await fs.writeFile(
        path.join(directory, "package.json"),
        JSON.stringify({
          private: true,
          type: "module",
          dependencies: { "auth-kernel-fixture": "file:./kernel", "better-auth": version },
        })
      );
      await execFileAsync(
        "pnpm",
        [
          "install",
          "--no-frozen-lockfile",
          "--ignore-scripts",
          "--registry=https://registry.npmjs.org",
          "--reporter=append-only",
        ],
        { cwd: directory, timeout: 120_000 }
      );
      const result = await execFileAsync(
        process.execPath,
        ["--input-type=module", "-e", 'await import("auth-kernel-fixture")'],
        { cwd: directory, timeout: 30_000 }
      );
      expect(result.stdout).toContain("Kernel auth imports OK");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }, 180_000);
});
