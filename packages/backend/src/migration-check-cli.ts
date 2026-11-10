#!/usr/bin/env node
import { parseArgs } from "node:util";
import { runMigrationCheck } from "./migration-check";

function main(): void {
  const { values } = parseArgs({
    options: {
      folder: { type: "string" },
      base: { type: "string" },
    },
  });

  if (!values.folder) {
    console.error("Usage: m5kdev-migration-check --folder <drizzle-postgresql> [--base <git ref>]");
    process.exit(1);
  }

  try {
    const result = runMigrationCheck({ folder: values.folder, base: values.base });
    for (const problem of result.problems) console.error(problem);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
