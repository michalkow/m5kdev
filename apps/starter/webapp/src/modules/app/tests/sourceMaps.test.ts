/** @jest-environment node */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const webapp = path.resolve(__dirname, "../../../..");
const vite = path.join(path.dirname(require.resolve("vite/package.json")), "bin/vite.js");

describe("Vite source map artifacts", () => {
  let fixture: string;
  beforeEach(() => {
    fixture = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "posthog-vite-")));
    fs.writeFileSync(
      path.join(fixture, "index.html"),
      '<script type="module" src="/main.js"></script>'
    );
    fs.writeFileSync(
      path.join(fixture, "main.js"),
      'window.projectKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY; window.fail = () => { throw new Error("source map fixture"); };'
    );
    fs.mkdirSync(path.join(fixture, "bin"));
    fs.writeFileSync(
      path.join(fixture, "bin/posthog-cli"),
      `#!/usr/bin/env node
const fs = require("node:fs");
const files = fs.readFileSync(0, "utf8").trim().split("\\n").filter(Boolean);
fs.writeFileSync(process.env.UPLOAD_CAPTURE, JSON.stringify({
  apiKey: process.env.POSTHOG_CLI_API_KEY, projectId: process.env.POSTHOG_CLI_PROJECT_ID,
  host: process.env.POSTHOG_CLI_HOST, args: process.argv.slice(2),
  files: files.map(file => ({ file, code: fs.readFileSync(file, "utf8"), map: JSON.parse(fs.readFileSync(file + ".map", "utf8")) }))
}));
process.exit(Number(process.env.UPLOAD_EXIT || 0));
`,
      { mode: 0o755 }
    );
  });
  afterEach(() => {
    fs.rmSync(fixture, { recursive: true, force: true });
  });

  function build(upload: boolean, extra: Record<string, string> = {}) {
    const env = {
      ...process.env,
      PATH: `${path.join(fixture, "bin")}${path.delimiter}${process.env.PATH}`,
      VITE_PUBLIC_POSTHOG_KEY: "phc_public",
      POSTHOG_API_KEY: upload ? "phx_private_fixture" : "",
      POSTHOG_PROJECT_ID: upload ? "42" : "",
      POSTHOG_HOST: "https://posthog.test",
      UPLOAD_CAPTURE: path.join(fixture, "upload.json"),
      ...extra,
    };
    return spawnSync(
      process.execPath,
      [
        vite,
        "build",
        fixture,
        "--config",
        path.join(webapp, "vite.config.ts"),
        "--outDir",
        path.join(fixture, "dist"),
      ],
      { cwd: fixture, env, encoding: "utf8" }
    );
  }

  it("uploads the exact emitted chunks with maps and removes maps from public output", () => {
    const result = build(true);
    expect(result.stderr + result.stdout).not.toContain("phx_private_fixture");
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(fixture, "upload.json"))).toBe(true);
    const upload = JSON.parse(fs.readFileSync(path.join(fixture, "upload.json"), "utf8"));
    expect(upload).toMatchObject({
      apiKey: "phx_private_fixture",
      projectId: "42",
      host: "https://posthog.test",
    });
    expect(upload.args.slice(0, 2)).toEqual(["sourcemap", "upload"]);
    expect(upload.files).toHaveLength(1);
    for (const artifact of upload.files) {
      const emitted = fs.readFileSync(artifact.file, "utf8");
      expect(emitted).toBe(artifact.code);
      expect(emitted).toMatch(/chunkId=[a-f0-9-]+/);
      expect(emitted).toContain("phc_public");
      expect(emitted).not.toContain("phx_private_fixture");
      expect(emitted).not.toContain("sourceMappingURL");
      expect(artifact.map.sourcesContent.join("\n")).toContain("source map fixture");
      expect(fs.existsSync(`${artifact.file}.map`)).toBe(false);
    }
  }, 30000);
  it("builds without upload credentials and ships no source maps", () => {
    const result = build(false);
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
    expect(fs.existsSync(path.join(fixture, "upload.json"))).toBe(false);
    expect(
      fs.readdirSync(path.join(fixture, "dist/assets")).some((file) => file.endsWith(".map"))
    ).toBe(false);
  }, 30000);

  it("fails a configured build when upload fails and retains the maps for diagnosis", () => {
    const result = build(true, { UPLOAD_EXIT: "17" });
    expect(result.status).not.toBe(0);
    expect(fs.existsSync(path.join(fixture, "upload.json"))).toBe(true);
    const upload = JSON.parse(fs.readFileSync(path.join(fixture, "upload.json"), "utf8"));
    expect(fs.existsSync(`${upload.files[0].file}.map`)).toBe(true);
    expect(result.stderr + result.stdout).not.toContain("phx_private_fixture");
  }, 30000);

  it("rejects partially configured uploads with an actionable error", () => {
    const result = build(false, { POSTHOG_PROJECT_ID: "42" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("POSTHOG_API_KEY and POSTHOG_PROJECT_ID together");
  }, 30000);
});
