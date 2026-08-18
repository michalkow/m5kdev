import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { type Client, createClient } from "@libsql/client";
import * as dotenv from "dotenv";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { withLibsqlRetry } from "./lib/libsql";

const DATABASE_COMMANDS = ["reset", "sync", "seed"] as const;
const DB_SIDECAR_SUFFIXES = ["-shm", "-wal", "-journal", "-info", "-client_wal_index"] as const;
const CONNECT_TIMEOUT_MS = 500;

type DatabaseCommand = (typeof DATABASE_COMMANDS)[number];

export interface RunDbSeedContext<TSchema extends Record<string, unknown>> {
  readonly orm: LibSQLDatabase<TSchema>;
  readonly schema: TSchema;
  readonly client: Client;
  readonly isRemote: boolean;
}

export interface RunDbConfig<TSchema extends Record<string, unknown>> {
  readonly schema: TSchema;
  readonly seed?: (context: RunDbSeedContext<TSchema>) => Promise<void>;
  readonly databaseUrl?: string;
  readonly tursoDatabaseUrl?: string;
  readonly tursoAuthToken?: string;
  readonly port?: number;
  readonly skipGuard?: boolean;
  readonly emailOutputDirectory?: string;
  readonly syncBeforeSeed?: boolean;
}

export interface DefineDrizzleKitConfigOptions {
  readonly schema: string;
}

export interface DrizzleKitConfig {
  readonly dialect: "sqlite" | "turso";
  readonly schema: string;
  readonly out: string;
  readonly dbCredentials: {
    readonly url: string;
    readonly authToken?: string;
  };
}

function isDatabaseCommand(value: string): value is DatabaseCommand {
  return DATABASE_COMMANDS.some((command) => command === value);
}

function parseCommand(argv: readonly string[]): DatabaseCommand {
  const positional = argv.slice(2).filter((token) => !token.startsWith("-"));
  const command = positional.at(-1);
  if (!command || !isDatabaseCommand(command)) {
    throw new Error(
      `Unknown Database command: ${command ?? "(none)"}. Expected reset, sync, or seed.`
    );
  }
  return command;
}

function resolveSkipGuard(skipGuard: boolean | undefined): boolean {
  return skipGuard ?? process.env.SKIP_DB_GUARD === "true";
}

function resolvePort(port: number | undefined): number {
  if (port !== undefined) {
    return port;
  }
  return Number.parseInt(process.env.PORT ?? "8080", 10);
}

function resolveDatabaseUrl(databaseUrl: string | undefined): string | undefined {
  return databaseUrl ?? process.env.DATABASE_URL;
}

function resolveTursoDatabaseUrl(tursoDatabaseUrl: string | undefined): string | undefined {
  return tursoDatabaseUrl ?? process.env.TURSO_DATABASE_URL;
}

function resolveTursoAuthToken(tursoAuthToken: string | undefined): string | undefined {
  return tursoAuthToken ?? process.env.TURSO_AUTH_TOKEN;
}

function resolveEmailOutputDirectory(emailOutputDirectory: string | undefined): string | undefined {
  return emailOutputDirectory ?? process.env.EMAIL_OUTPUT_DIRECTORY;
}

function sqlitePathFromDatabaseUrl(url: string): string | null {
  if (!url.startsWith("file:")) {
    return null;
  }
  return path.resolve(process.cwd(), url.slice("file:".length));
}

async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const done = (result: boolean): void => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function ensureDevServerStopped(input: {
  readonly databaseUrl: string;
  readonly port: number;
  readonly skipGuard: boolean;
}): Promise<void> {
  if (input.skipGuard) {
    return;
  }
  if (!input.databaseUrl.startsWith("file:")) {
    return;
  }
  if (Number.isNaN(input.port) || !(await isPortInUse(input.port))) {
    return;
  }
  throw new Error(
    `A server is listening on port ${input.port} and holds ${input.databaseUrl}. Stop the dev server first, or set SKIP_DB_GUARD=true to override.`
  );
}

async function removeIfExists(target: string): Promise<void> {
  await fs.rm(target, { recursive: true, force: true });
}

async function runReset(input: {
  readonly databaseUrl: string;
  readonly emailOutputDirectory?: string;
}): Promise<void> {
  const dbPath = sqlitePathFromDatabaseUrl(input.databaseUrl);
  if (dbPath) {
    await removeIfExists(dbPath);
    for (const suffix of DB_SIDECAR_SUFFIXES) {
      await removeIfExists(`${dbPath}${suffix}`);
    }
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
  }

  const emailDirectory = input.emailOutputDirectory
    ? path.resolve(process.cwd(), input.emailOutputDirectory)
    : null;

  if (emailDirectory) {
    await removeIfExists(emailDirectory);
    await fs.mkdir(emailDirectory, { recursive: true });
  }
}

function createScriptClient(input: {
  readonly databaseUrl: string;
  readonly tursoDatabaseUrl?: string;
  readonly tursoAuthToken?: string;
}): { client: Client; isRemote: boolean } {
  const isRemote = Boolean(input.tursoDatabaseUrl && input.tursoAuthToken);
  const raw = createClient(
    isRemote
      ? {
          url: input.databaseUrl,
          syncUrl: input.tursoDatabaseUrl,
          authToken: input.tursoAuthToken,
        }
      : { url: input.databaseUrl }
  );
  return { client: withLibsqlRetry(raw), isRemote };
}

export async function runDb<TSchema extends Record<string, unknown>>(
  config: RunDbConfig<TSchema>
): Promise<void> {
  const command = parseCommand(process.argv);
  const databaseUrl = resolveDatabaseUrl(config.databaseUrl);
  const skipGuard = resolveSkipGuard(config.skipGuard);
  const port = resolvePort(config.port);
  const scriptDatabaseUrl = databaseUrl ?? "file:./local.db";

  await ensureDevServerStopped({
    databaseUrl: scriptDatabaseUrl,
    port,
    skipGuard,
  });

  if (command === "reset") {
    await runReset({
      databaseUrl: databaseUrl ?? "",
      emailOutputDirectory: resolveEmailOutputDirectory(config.emailOutputDirectory),
    });
    return;
  }

  if (command === "seed" && !config.seed) {
    throw new Error("Database command seed requires a seed callback in Database config.");
  }

  const { client, isRemote } = createScriptClient({
    databaseUrl: scriptDatabaseUrl,
    tursoDatabaseUrl: resolveTursoDatabaseUrl(config.tursoDatabaseUrl),
    tursoAuthToken: resolveTursoAuthToken(config.tursoAuthToken),
  });

  try {
    if (command === "sync") {
      if (isRemote) {
        await client.sync();
      } else {
        console.info("Local database no sync required");
      }
      return;
    }

    const syncBeforeSeed = config.syncBeforeSeed ?? true;
    if (isRemote && syncBeforeSeed) {
      await client.sync();
    }

    const orm = drizzle(client, { schema: config.schema });
    await config.seed?.({
      orm,
      schema: config.schema,
      client,
      isRemote,
    });
  } finally {
    client.close();
  }
}

export function defineDrizzleKitConfig(options: DefineDrizzleKitConfigOptions): DrizzleKitConfig {
  dotenv.config({ path: process.env.DRIZZLE_ENV_PATH || "../shared/.env" });
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const out = "./drizzle";

  if (!url) {
    throw new Error("DATABASE_URL or TURSO_DATABASE_URL must be set");
  }

  if (url && authToken) {
    return {
      dialect: "turso",
      schema: options.schema,
      out,
      dbCredentials: {
        url,
        authToken,
      },
    };
  }

  return {
    dialect: "sqlite",
    schema: options.schema,
    out,
    dbCredentials: {
      url,
    },
  };
}
