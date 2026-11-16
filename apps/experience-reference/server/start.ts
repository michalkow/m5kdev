import { randomUUID } from "node:crypto";

let started = false;
export async function startReference(topology: "local" | "shared" = "local") {
  if (!process.env.TEST_DATABASE_URL)
    throw new Error("TEST_DATABASE_URL must name a disposable local PostgreSQL database");
  if (started) throw new Error("Reference fixtures run once per worker process");
  started = true;
  process.env.DATABASE_SCHEMA = `test_${randomUUID().replaceAll("-", "")}`;
  process.env.LOG_LEVEL ??= "warn";
  const { bootReference } = await import("./fixture");
  return bootReference(topology);
}
export type ReferenceApp = Awaited<ReturnType<typeof startReference>>;
