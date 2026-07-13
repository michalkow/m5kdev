import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../src/schema";

/**
 * Standalone DB handle for scripts (seed, maintenance). Deliberately does NOT
 * import ./app — constructing the backend app opens Redis/queue connections
 * that keep short-lived scripts alive forever. The running server gets its own
 * connection through createBackendApp.
 */
const databaseUrl = process.env.DATABASE_URL ?? "file:./local.db";
const syncUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

export const isRemote = syncUrl && authToken;

const client = createClient(
  isRemote ? { url: databaseUrl, syncUrl, authToken } : { url: databaseUrl }
);

export const orm = drizzle(client, { schema });

export type Orm = typeof orm;
export type Schema = typeof schema;

export { schema };
