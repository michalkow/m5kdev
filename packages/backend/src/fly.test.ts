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
      "--build-arg",
      expect.stringMatching(/^VITE_CONFIG_HASH=[a-f0-9]{64}$/),
      "--build-secret",
      "ALL_SECRETS=export VITE_APP_URL='https://example.com'\nexport REDIS_URL='redis://x'",
      "--build-secret",
      "VITE_APP_URL=https://example.com",
      "--build-secret",
      "REDIS_URL=redis://x",
    ]);
  });

  it("invalidates frontend builds only when public VITE configuration changes", async () => {
    const envPath = path.join(tempRoot, ".env.production");
    const deploy = async (body: string) => {
      await fs.promises.writeFile(envPath, body);
      runFlyDeploy({ config: "fly.toml", dockerfile: "Dockerfile", env: envPath });
      const args = spawnSyncMock.mock.calls.at(-1)?.[1];
      const cacheKey = args?.find((arg) => arg.startsWith("VITE_CONFIG_HASH="));
      expect(cacheKey).toMatch(/^VITE_CONFIG_HASH=[a-f0-9]{64}$/);
      return cacheKey;
    };

    const original = await deploy("VITE_URL=https://example.com\nVITE_NAME=App\nSECRET=one\n");
    expect(
      await deploy(
        '# reordered and quoted\nSECRET=two\nVITE_NAME="App"\nVITE_URL=https://example.com\n'
      )
    ).toBe(original);
    expect(
      await deploy("VITE_URL=https://other.example.com\nVITE_NAME=App\nSECRET=one\n")
    ).not.toBe(original);
    expect(await deploy("VITE_URL=https://example.com\nSECRET=one\n")).not.toBe(original);
    expect(
      await deploy("VITE_URL=https://example.com\nVITE_NAME=App\nVITE_NEW=yes\nSECRET=one\n")
    ).not.toBe(original);
  });

  it("invalidates the SPA build when private upload configuration changes", async () => {
    const envPath = path.join(tempRoot, ".env.production");
    const deploy = async (key: string, project: string, host: string) => {
      await fs.promises.writeFile(
        envPath,
        `VITE_URL=https://app.test\nPOSTHOG_API_KEY=${key}\nPOSTHOG_PROJECT_ID=${project}\nPOSTHOG_HOST=${host}\n`
      );
      runFlyDeploy({ config: "fly.toml", dockerfile: "Dockerfile", env: envPath });
      const args = spawnSyncMock.mock.calls.at(-1)?.[1];
      return args?.find((arg) => arg.startsWith("VITE_CONFIG_HASH="));
    };
    const initial = await deploy("secret-one", "42", "https://us.posthog.com");
    expect(await deploy("secret-two", "42", "https://us.posthog.com")).not.toBe(initial);
    expect(await deploy("secret-one", "43", "https://us.posthog.com")).not.toBe(initial);
    expect(await deploy("secret-one", "42", "https://eu.posthog.com")).not.toBe(initial);
  });

  it("keeps private source map configuration out of runtime secrets", async () => {
    const envPath = path.join(tempRoot, ".env.production");
    await fs.promises.writeFile(
      envPath,
      "# runtime\nDATABASE_URL=postgres://runtime\nPOSTHOG_API_KEY=phx_private\nPOSTHOG_PROJECT_ID=42\nPOSTHOG_HOST=https://us.posthog.com\nVITE_PUBLIC_POSTHOG_KEY=phc_public\n"
    );
    runFlySecrets({ config: "fly.toml", env: envPath });
    const body = spawnSyncMock.mock.calls[0]?.[2]?.input?.toString() ?? "";
    expect(parseDotenv(body)).toEqual({
      DATABASE_URL: "postgres://runtime",
      VITE_PUBLIC_POSTHOG_KEY: "phc_public",
    });
    expect(body).not.toContain("phx_private");
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
