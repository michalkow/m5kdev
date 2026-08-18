#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";

function missingEnvMessage(envPath) {
  return `Missing ${envPath}. Copy the .env.production.example next to it, fill in values, then retry.`;
}

const { values } = parseArgs({
  options: {
    config: { type: "string" },
    env: { type: "string" },
  },
});

if (!values.config || !values.env) {
  console.error("Usage: fly-secrets.mjs --config <fly.toml> --env <.env.production>");
  process.exit(1);
}

if (!existsSync(values.env)) {
  console.error(missingEnvMessage(values.env));
  process.exit(1);
}

const result = spawnSync("fly", ["secrets", "import", "-c", values.config], {
  input: readFileSync(values.env),
  stdio: ["pipe", "inherit", "inherit"],
});
process.exit(result.status ?? 1);
