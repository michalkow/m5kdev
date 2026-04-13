import { spawnSync } from "node:child_process";
import { generateSchema } from "./generate-schema";

export async function syncDatabase(): Promise<void> {
  await generateSchema();

  const command = process.platform === "win32" ? "drizzle-kit.cmd" : "drizzle-kit";
  const result = spawnSync(command, ["push", "--config", "drizzle.config.ts", "--force"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`drizzle-kit push failed with exit code ${result.status ?? "unknown"}`);
  }
}

syncDatabase().then(() => {
  console.info("Sync completed");
});
