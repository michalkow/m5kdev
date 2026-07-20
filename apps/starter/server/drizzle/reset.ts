import fs from "node:fs/promises";
import path from "node:path";
import { ensureDevServerStopped } from "./guard";

/** Deletes the local SQLite database (and stored-email output) for a clean slate. */
function sqlitePathFromDatabaseUrl(url: string) {
  if (!url.startsWith("file:")) return null;
  return path.resolve(process.cwd(), url.slice("file:".length));
}

// Sidecars include the embedded-replica sync metadata (-info, -client_wal_index);
// leaving those behind next to a recreated file causes WAL/sync conflicts.
const DB_SIDECAR_SUFFIXES = ["-shm", "-wal", "-journal", "-info", "-client_wal_index"];

async function removeIfExists(target: string) {
  await fs.rm(target, { recursive: true, force: true });
}

async function reset() {
  await ensureDevServerStopped();
  const dbPath = sqlitePathFromDatabaseUrl(process.env.DATABASE_URL ?? "");
  if (dbPath) {
    await removeIfExists(dbPath);
    for (const suffix of DB_SIDECAR_SUFFIXES) {
      await removeIfExists(`${dbPath}${suffix}`);
    }
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
  }

  const emailDirectory = process.env.EMAIL_OUTPUT_DIRECTORY
    ? path.resolve(process.cwd(), process.env.EMAIL_OUTPUT_DIRECTORY)
    : null;

  if (emailDirectory) {
    await removeIfExists(emailDirectory);
    await fs.mkdir(emailDirectory, { recursive: true });
  }
}

void reset();
