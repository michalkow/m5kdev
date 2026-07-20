import net from "node:net";

const CONNECT_TIMEOUT_MS = 500;

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const done = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/**
 * The dev server holds its own libsql connection on the local database file —
 * an embedded replica when Turso is configured. A second process syncing or
 * deleting that file corrupts the WAL, so db scripts must not run while the
 * server is up. Best-effort check: only the conventional PORT is probed.
 */
export async function ensureDevServerStopped(): Promise<void> {
  if (process.env.SKIP_DB_GUARD === "true") return;
  const databaseUrl = process.env.DATABASE_URL ?? "file:./local.db";
  if (!databaseUrl.startsWith("file:")) return;
  const port = Number.parseInt(process.env.PORT ?? "8080", 10);
  if (Number.isNaN(port) || !(await isPortInUse(port))) return;
  console.error(
    `[drizzle] A server is listening on port ${port} and holds ${databaseUrl}. ` +
      "Stop the dev server first, or set SKIP_DB_GUARD=true to override."
  );
  process.exit(1);
}
