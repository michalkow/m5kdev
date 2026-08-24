import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export interface RunFlyDeployOptions {
  readonly config: string;
  readonly dockerfile: string;
  readonly env: string;
}

export interface RunFlySecretsOptions {
  readonly config: string;
  readonly env: string;
}

export class FlyCommandError extends Error {
  readonly exitCode: number;

  constructor(exitCode: number, message?: string) {
    super(message ?? "");
    this.name = "FlyCommandError";
    this.exitCode = exitCode;
  }
}

export function missingEnvMessage(envPath: string): string {
  return `Missing ${envPath}. Copy the .env.production.example next to it, fill in values, then retry.`;
}

export function parseDotenv(source: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function toExportScript(vars: Readonly<Record<string, string>>): string {
  return Object.entries(vars)
    .map(([key, value]) => `export ${key}=${shellSingleQuote(value)}`)
    .join("\n");
}

function assertEnvFile(envPath: string): void {
  if (!existsSync(envPath)) {
    throw new FlyCommandError(1, missingEnvMessage(envPath));
  }
}

function assertFlyStatus(result: SpawnSyncReturns<Buffer | string>): void {
  if (result.error) {
    throw new FlyCommandError(1, result.error.message);
  }
  if (result.status !== 0) {
    throw new FlyCommandError(result.status ?? 1);
  }
}

export function runFlyDeploy(options: RunFlyDeployOptions): void {
  assertEnvFile(options.env);
  const vars = parseDotenv(readFileSync(options.env, "utf8"));
  const args = [
    "deploy",
    "-c",
    options.config,
    "--dockerfile",
    options.dockerfile,
    "--build-secret",
    `ALL_SECRETS=${toExportScript(vars)}`,
  ];
  for (const [key, value] of Object.entries(vars)) {
    args.push("--build-secret", `${key}=${value}`);
  }
  assertFlyStatus(spawnSync("fly", args, { stdio: "inherit" }));
}

export function runFlySecrets(options: RunFlySecretsOptions): void {
  assertEnvFile(options.env);
  assertFlyStatus(
    spawnSync("fly", ["secrets", "import", "-c", options.config], {
      input: readFileSync(options.env),
      stdio: ["pipe", "inherit", "inherit"],
    })
  );
}
