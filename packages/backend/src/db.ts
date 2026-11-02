import { access } from "node:fs/promises";
import { join } from "node:path";
import * as dotenv from "dotenv";
import { is } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { Pool } from "pg";

const DATABASE_COMMANDS = ["reset", "migrate", "seed"] as const;
type DatabaseCommand = (typeof DATABASE_COMMANDS)[number];

export interface RunDbSeedContext<TSchema extends Record<string, unknown>> {
  readonly orm: NodePgDatabase<TSchema>;
  readonly schema: TSchema;
  readonly client: Pool;
}

export interface RunDbConfig<TSchema extends Record<string, unknown>> {
  readonly schema: TSchema;
  readonly seed?: (context: RunDbSeedContext<TSchema>) => Promise<void>;
  readonly databaseDirectUrl?: string;
  readonly databaseSchema?: string;
  readonly disposable?: boolean;
  readonly migrationsFolder?: string;
}

export interface DefineDrizzleKitConfigOptions {
  readonly schema: string;
  readonly out?: string;
}

export interface DrizzleKitConfig {
  readonly dialect: "postgresql";
  readonly schema: string;
  readonly out: string;
  readonly schemaFilter: string[];
  readonly dbCredentials: { readonly url: string };
}

function directConnectionUrl(value: string | undefined): string {
  if (!value)
    throw new Error("DATABASE_DIRECT_URL must be set for Database commands and migrations");
  try {
    const connection = new URL(value);
    if (!["postgres:", "postgresql:"].includes(connection.protocol) || !connection.hostname) {
      throw new Error("Invalid connection");
    }
  } catch {
    throw new Error("DATABASE_DIRECT_URL must be a PostgreSQL connection URL");
  }
  return value;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function resetSchema<TSchema extends Record<string, unknown>>(
  config: RunDbConfig<TSchema>
): string {
  const namespace = config.databaseSchema ?? process.env.DATABASE_SCHEMA ?? "app";
  const protectedSchemas = new Set([
    "public",
    "information_schema",
    "drizzle",
    "mastra",
    "vectors",
    process.env.MASTRA_DATABASE_SCHEMA,
    process.env.VECTOR_DATABASE_SCHEMA,
  ]);
  if (
    !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(namespace) ||
    namespace.startsWith("pg_") ||
    protectedSchemas.has(namespace)
  ) {
    throw new Error("Reset requires an unambiguous app-owned schema, not a protected schema");
  }
  for (const table of Object.values(config.schema)) {
    if (is(table, PgTable) && getTableConfig(table).schema !== namespace) {
      throw new Error("Reset schema must match every app-owned table in the composed schema");
    }
  }
  return namespace;
}

export async function runDb<TSchema extends Record<string, unknown>>(
  config: RunDbConfig<TSchema>
): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] as DatabaseCommand | undefined;
  if (args.length !== 1 || !command || !DATABASE_COMMANDS.includes(command)) {
    throw new Error(`Unknown Database command. Expected ${DATABASE_COMMANDS.join(", ")}.`);
  }
  const url = directConnectionUrl(config.databaseDirectUrl ?? process.env.DATABASE_DIRECT_URL);
  if (command === "seed" && !config.seed) {
    throw new Error("Database command seed requires a seed callback in Database config.");
  }
  let namespace: string | undefined;
  const migrationsFolder = config.migrationsFolder ?? "./drizzle-postgresql";
  if (command === "migrate") {
    try {
      await access(join(migrationsFolder, "meta", "_journal.json"));
    } catch {
      throw new Error(
        `PostgreSQL migration history is missing at ${migrationsFolder}. Ask the maintainer to run drizzle:generate and review the baseline before migrating.`
      );
    }
  }
  if (command === "reset") {
    if (!(config.disposable ?? process.env.DATABASE_DISPOSABLE === "true")) {
      throw new Error(
        "Reset requires DATABASE_DISPOSABLE=true for an explicitly disposable environment"
      );
    }
    namespace = resetSchema(config);
  }
  const client = new Pool({ connectionString: url, max: 1 });
  try {
    const orm = drizzle(client, { schema: config.schema });
    if (command === "migrate") {
      await migrate(orm, { migrationsFolder });
    } else if (command === "seed") {
      await config.seed?.({ orm, schema: config.schema, client });
    } else {
      const tables = await client.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename",
        [namespace]
      );
      if (tables.rows.length > 0) {
        const targets = tables.rows.map(
          ({ tablename }) => `${quoteIdentifier(namespace!)}.${quoteIdentifier(tablename)}`
        );
        await client.query(`TRUNCATE TABLE ${targets.join(", ")} RESTART IDENTITY RESTRICT`);
      }
    }
  } finally {
    await client.end();
  }
}

export function defineDrizzleKitConfig(options: DefineDrizzleKitConfigOptions): DrizzleKitConfig {
  dotenv.config({ path: process.env.DRIZZLE_ENV_PATH || "../shared/.env" });
  const url = directConnectionUrl(process.env.DATABASE_DIRECT_URL);
  return {
    dialect: "postgresql",
    schema: options.schema,
    out: options.out ?? "./drizzle-postgresql",
    schemaFilter: [process.env.DATABASE_SCHEMA ?? "app"],
    dbCredentials: { url },
  };
}
