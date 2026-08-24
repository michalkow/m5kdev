#!/usr/bin/env node
import { parseArgs } from "node:util";
import { FlyCommandError, runFlyDeploy } from "./fly";

function main(): void {
  const { values } = parseArgs({
    options: {
      config: { type: "string" },
      dockerfile: { type: "string" },
      env: { type: "string" },
    },
  });

  if (!values.config || !values.dockerfile || !values.env) {
    console.error(
      "Usage: m5kdev-fly-deploy --config <fly.toml> --dockerfile <Dockerfile> --env <.env.production>"
    );
    process.exit(1);
  }

  try {
    runFlyDeploy({
      config: values.config,
      dockerfile: values.dockerfile,
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
