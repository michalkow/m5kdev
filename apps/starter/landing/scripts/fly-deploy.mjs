#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";

function missingEnvMessage(envPath) {
  return `Missing ${envPath}. Copy the .env.production.example next to it, fill in values, then retry.`;
}

function parseDotenv(source) {
  const vars = {};
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

function shellSingleQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function toExportScript(vars) {
  return Object.entries(vars)
    .map(([key, value]) => `export ${key}=${shellSingleQuote(value)}`)
    .join("\n");
}

const { values } = parseArgs({
  options: {
    config: { type: "string" },
    dockerfile: { type: "string" },
    env: { type: "string" },
  },
});

if (!values.config || !values.dockerfile || !values.env) {
  console.error(
    "Usage: fly-deploy.mjs --config <fly.toml> --dockerfile <Dockerfile> --env <.env.production>"
  );
  process.exit(1);
}

if (!existsSync(values.env)) {
  console.error(missingEnvMessage(values.env));
  process.exit(1);
}

const vars = parseDotenv(readFileSync(values.env, "utf8"));
const args = [
  "deploy",
  "-c",
  values.config,
  "--dockerfile",
  values.dockerfile,
  "--build-secret",
  `ALL_SECRETS=${toExportScript(vars)}`,
];
for (const [key, value] of Object.entries(vars)) {
  args.push("--build-secret", `${key}=${value}`);
}

const result = spawnSync("fly", args, { stdio: "inherit" });
process.exit(result.status ?? 1);
