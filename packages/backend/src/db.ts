import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import * as dotenv from "dotenv";
import { is } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { Pool, type PoolClient } from "pg";

const DATABASE_COMMANDS = ["reset", "migrate", "seed", "rebuild"] as const;
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
  /** PostgreSQL schema holding Drizzle's migration history. Default `drizzle`. */
  readonly migrationsSchema?: string;
  /** `lock_timeout` for the migration session. Default `5s`. */
  readonly lockTimeout?: string;
  /** `statement_timeout` for the migration session. Default `5min`. */
  readonly statementTimeout?: string;
  /** Progress output. Never receives connection strings. Default `console.info`. */
  readonly log?: (message: string) => void;
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

const DEFAULT_MIGRATIONS_SCHEMA = "drizzle";

/**
 * Drop the app-owned schema and Drizzle's migration history so the next migrate
 * replays every migration. Refuses when another schema has a foreign key into the
 * app schema, so Mastra/vector data and structure are never cascaded away.
 */
async function dropAppSchema(
  session: PoolClient,
  namespace: string,
  migrationsSchema: string
): Promise<void> {
  const dependents = await session.query<{ name: string }>(
    `SELECT conrelid::regclass::text AS name
       FROM pg_constraint
      WHERE contype = 'f'
        AND confrelid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1)
        AND conrelid NOT IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1)`,
    [namespace]
  );
  if (dependents.rows.length > 0) {
    throw new Error(
      `Rebuild refuses to drop ${namespace}: foreign keys from ${dependents.rows
        .map((row) => row.name)
        .join(", ")} reference it`
    );
  }
  await session.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(namespace)} CASCADE`);
  await session.query(
    `DROP TABLE IF EXISTS ${quoteIdentifier(migrationsSchema)}."__drizzle_migrations"`
  );
}

/** Host, port and database name only — never user or password. */
function describeTarget(url: string): string {
  const target = new URL(url);
  return `${target.hostname}${target.port ? `:${target.port}` : ""}${target.pathname}`;
}

/** Journal tags Drizzle will apply: entries newer than the latest applied migration. */
async function pendingMigrations(
  session: PoolClient,
  migrationsFolder: string,
  migrationsSchema: string
): Promise<string[]> {
  const journal = JSON.parse(
    await readFile(join(migrationsFolder, "meta", "_journal.json"), "utf8")
  ) as { entries: { tag: string; when: number }[] };
  const table = await session.query<{ exists: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [`${quoteIdentifier(migrationsSchema)}."__drizzle_migrations"`]
  );
  let lastApplied = Number.NEGATIVE_INFINITY;
  if (table.rows[0]?.exists) {
    const latest = await session.query<{ created_at: string | null }>(
      `SELECT max(created_at)::text AS created_at FROM ${quoteIdentifier(migrationsSchema)}."__drizzle_migrations"`
    );
    if (latest.rows[0]?.created_at) lastApplied = Number(latest.rows[0].created_at);
  }
  return journal.entries.filter((entry) => entry.when > lastApplied).map((entry) => entry.tag);
}
const DEFAULT_LOCK_TIMEOUT = "5s";
const DEFAULT_STATEMENT_TIMEOUT = "5min";

interface MigrateWithLockOptions<TSchema extends Record<string, unknown>> {
  readonly pool: Pool;
  readonly config: RunDbConfig<TSchema>;
  readonly migrationsFolder: string;
  readonly migrationsSchema: string;
  readonly url: string;
  /** Runs while holding the migration lock, before pending migrations are read. */
  readonly beforeMigrate?: (session: PoolClient) => Promise<void>;
}

/**
 * Apply pending migrations on one session that holds a PostgreSQL advisory lock,
 * so concurrent runners (a deploy and an agent) wait instead of racing. Lock and
 * statement timeouts stop a blocked ALTER TABLE from stalling live traffic.
 */
async function migrateWithLock<TSchema extends Record<string, unknown>>({
  pool,
  config,
  migrationsFolder,
  migrationsSchema,
  url,
  beforeMigrate,
}: MigrateWithLockOptions<TSchema>): Promise<void> {
  const log = config.log ?? ((message: string) => console.info(message));
  const lockKey = `m5kdev:migrate:${migrationsSchema}`;
  const appEnv = process.env.APP_ENV?.trim();
  const session = await pool.connect();
  try {
    await session.query("SELECT set_config('statement_timeout', $1, false)", [
      config.statementTimeout ?? DEFAULT_STATEMENT_TIMEOUT,
    ]);
    // A concurrent runner waits for the advisory lock (bounded by statement_timeout);
    // lock_timeout applies only to the migration statements themselves.
    await session.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [lockKey]);
    await session.query("SELECT set_config('lock_timeout', $1, false)", [
      config.lockTimeout ?? DEFAULT_LOCK_TIMEOUT,
    ]);
    try {
      await beforeMigrate?.(session);
      const pending = await pendingMigrations(session, migrationsFolder, migrationsSchema);
      log(
        `Migrating ${describeTarget(url)} (${migrationsSchema})${
          appEnv ? ` for APP_ENV=${appEnv}` : ""
        }: ${pending.length} pending${
          pending.length ? `\n${pending.map((tag) => `  - ${tag}`).join("\n")}` : ""
        }`
      );
      await migrate(drizzle(session, { schema: config.schema }), {
        migrationsFolder,
        migrationsSchema,
      });
    } finally {
      await session.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [lockKey]);
    }
  } finally {
    session.release();
  }
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
  const migrationsSchema = config.migrationsSchema ?? DEFAULT_MIGRATIONS_SCHEMA;
  if (command === "migrate" || command === "rebuild") {
    try {
      await access(join(migrationsFolder, "meta", "_journal.json"));
    } catch {
      throw new Error(
        `PostgreSQL migration history is missing at ${migrationsFolder}. Ask the maintainer to run drizzle:generate and review the baseline before migrating.`
      );
    }
  }
  if (command === "reset" || command === "rebuild") {
    if (!(config.disposable ?? process.env.DATABASE_DISPOSABLE === "true")) {
      throw new Error(
        `${command === "reset" ? "Reset" : "Rebuild"} requires DATABASE_DISPOSABLE=true for an explicitly disposable environment`
      );
    }
    namespace = resetSchema(config);
  }
  const client = new Pool({ connectionString: url, max: 1 });
  try {
    const orm = drizzle(client, { schema: config.schema });
    const migrateOptions = { pool: client, config, migrationsFolder, migrationsSchema, url };
    if (command === "migrate") {
      await migrateWithLock(migrateOptions);
    } else if (command === "rebuild") {
      await migrateWithLock({
        ...migrateOptions,
        beforeMigrate: (session) => dropAppSchema(session, namespace!, migrationsSchema),
      });
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
