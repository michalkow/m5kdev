#!/usr/bin/env node
import { parseArgs } from "node:util";
import { FlyCommandError, runFlySecrets } from "./fly";

function main(): void {
  const { values } = parseArgs({
    options: {
      config: { type: "string" },
      env: { type: "string" },
    },
  });

  if (!values.config || !values.env) {
    console.error("Usage: m5kdev-fly-secrets --config <fly.toml> --env <.env.production>");
    process.exit(1);
  }

  try {
    runFlySecrets({
      config: values.config,
      env: values.env,
    });
  } catch (error) {
    if (error instanceof FlyCommandError) {
      if (error.message) console.error(error.message);
      process.exit(error.exitCode);
    }
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
