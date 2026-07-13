import fs from "node:fs/promises";
import path from "node:path";

/** Deletes the local SQLite database (and stored-email output) for a clean slate. */
function sqlitePathFromDatabaseUrl(url: string) {
  if (!url.startsWith("file:")) return null;
  return path.resolve(process.cwd(), url.slice("file:".length));
}

async function removeIfExists(target: string) {
  await fs.rm(target, { recursive: true, force: true });
}

async function reset() {
  const dbPath = sqlitePathFromDatabaseUrl(process.env.DATABASE_URL ?? "");
  if (dbPath) {
    await removeIfExists(dbPath);
    await removeIfExists(`${dbPath}-shm`);
    await removeIfExists(`${dbPath}-wal`);
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
