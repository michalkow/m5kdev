import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FlyCommandError,
  missingEnvMessage,
  parseDotenv,
  runFlyDeploy,
  runFlySecrets,
  toExportScript,
} from "./fly";

jest.mock("node:child_process", () => ({
  spawnSync: jest.fn(),
}));

const spawnSyncMock = spawnSync as jest.MockedFunction<typeof spawnSync>;

describe("fly helpers", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "m5kdev-fly-"));
    spawnSyncMock.mockReset();
    spawnSyncMock.mockReturnValue({
      status: 0,
      signal: null,
      output: [],
      pid: 1,
      stdout: Buffer.from(""),
      stderr: Buffer.from(""),
    });
  });

  afterEach(async () => {
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  });

  it("parseDotenv skips comments and strips quotes", () => {
    expect(
      parseDotenv(`
# comment
FOO=bar
QUOTED="hello world"
SINGLE='x'
EMPTY=
`)
    ).toEqual({
      FOO: "bar",
      QUOTED: "hello world",
      SINGLE: "x",
      EMPTY: "",
    });
  });

  it("toExportScript shell-escapes single quotes", () => {
    expect(toExportScript({ KEY: "it's" })).toBe(`export KEY='it'\\''s'`);
  });

  it("runFlyDeploy fails clearly when the env file is missing", () => {
    const envPath = path.join(tempRoot, ".env.production");
    expect(() =>
      runFlyDeploy({
        config: "fly.toml",
        dockerfile: "Dockerfile",
        env: envPath,
      })
    ).toThrow(new FlyCommandError(1, missingEnvMessage(envPath)));
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it("runFlyDeploy forwards ALL_SECRETS and each key as build secrets", async () => {
    const envPath = path.join(tempRoot, ".env.production");
    await fs.promises.writeFile(envPath, "VITE_APP_URL=https://example.com\nREDIS_URL=redis://x\n");

    runFlyDeploy({
      config: "apps/shared/fly.toml",
      dockerfile: "apps/shared/Dockerfile",
      env: envPath,
    });

    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
    const call = spawnSyncMock.mock.calls[0];
    expect(call).toBeDefined();
    const [command, args, options] = call ?? [];
    expect(command).toBe("fly");
    expect(options).toEqual({ stdio: "inherit" });
    expect(args).toEqual([
      "deploy",
      "-c",
      "apps/shared/fly.toml",
      "--dockerfile",
      "apps/shared/Dockerfile",
      "--build-secret",
      "ALL_SECRETS=export VITE_APP_URL='https://example.com'\nexport REDIS_URL='redis://x'",
      "--build-secret",
      "VITE_APP_URL=https://example.com",
      "--build-secret",
      "REDIS_URL=redis://x",
    ]);
  });

  it("runFlySecrets imports the env file over stdin", async () => {
    const envPath = path.join(tempRoot, ".env.production");
    const body = "REDIS_URL=redis://x\n";
    await fs.promises.writeFile(envPath, body);

    runFlySecrets({
      config: "apps/shared/fly.toml",
      env: envPath,
    });

    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
    const call = spawnSyncMock.mock.calls[0];
    expect(call).toBeDefined();
    const [command, args, options] = call ?? [];
    expect(command).toBe("fly");
    expect(args).toEqual(["secrets", "import", "-c", "apps/shared/fly.toml"]);
    expect(options).toEqual({
      input: Buffer.from(body),
      stdio: ["pipe", "inherit", "inherit"],
    });
  });

  it("runFlySecrets fails clearly when the env file is missing", () => {
    const envPath = path.join(tempRoot, ".env.production");
    expect(() =>
      runFlySecrets({
        config: "fly.toml",
        env: envPath,
      })
    ).toThrow(new FlyCommandError(1, missingEnvMessage(envPath)));
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it("propagates a non-zero fly exit status", async () => {
    const envPath = path.join(tempRoot, ".env.production");
    await fs.promises.writeFile(envPath, "A=1\n");
    spawnSyncMock.mockReturnValue({
      status: 42,
      signal: null,
      output: [],
      pid: 1,
      stdout: Buffer.from(""),
      stderr: Buffer.from(""),
    });

    expect(() =>
      runFlyDeploy({
        config: "fly.toml",
        dockerfile: "Dockerfile",
        env: envPath,
      })
    ).toThrow(new FlyCommandError(42));
  });
});
