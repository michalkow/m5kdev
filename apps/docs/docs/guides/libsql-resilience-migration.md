---
sidebar_position: 8
---

# libsql resilience migration

This guide covers hardening libsql/Turso connection handling in existing m5kdev
apps. It addresses two production failure modes:

- **"hrana stream not found" errors** after the remote sqld/Turso node restarts
  or expires an idle stream. The backend's long-lived client kept reusing dead
  streams with no recovery path.
- **WAL conflicts / replica corruption** when a second process (seed, sync, or
  reset script) opened an embedded replica on the same local database file the
  dev server was already syncing.

New apps scaffolded from the starter template already include the wiring
described below. Existing apps follow the migration steps in this guide.

## What changed in the stack

| Layer | Change |
| --- | --- |
| `@m5kdev/backend` | `withLibsqlRetry` / `isRetryableLibsqlError` in `lib/libsql.ts`. The app kernel wraps the libsql client it creates so top-level calls (`execute`, `batch`, `migrate`, `executeMultiple`, `sync`, and the `transaction()` open) reconnect and retry on dead hrana streams. Caller-provided clients are used as-is. |
| `@m5kdev/backend` | `AIModule` accepts `vectorStore` as either a preconfigured `LibSQLVector` or a config object resolved via `createAiVectorStore` (`modules/ai/ai.vector.ts`). Remote URLs are always direct connections; a local file is a dev-only fallback. Module shutdown closes stores it created. |
| App server | Drizzle scripts (`seed`, `sync`, `reset`, `seed.e2e`) refuse to run against a local database file while the dev server is listening (`drizzle/guard.ts`). `reset` also removes embedded-replica sync metadata sidecars. |

## Database migration

**No schema change is required.** All changes concern connection lifecycle and
tooling; the database contents are untouched.

## Background: why these failures happen

**Hrana streams are stateful.** In embedded-replica mode (`file:` URL plus
`syncUrl`), every write is forwarded to the primary over the hrana protocol.
When the remote node restarts — or expires an idle stream — the next request on
a cached stream fails with a "stream not found" style error even though a fresh
attempt would succeed. Interactive transactions are the most exposed call sites
because they hold a stream open for their duration.

**Embedded replicas must have exactly one owner per file.** The replica sync
process injects WAL frames into the local file; a second client syncing (or
deleting) the same file produces salt/checksum mismatches — surfacing as WAL
conflicts and, in the worst case, a corrupted replica. This is why the drizzle
scripts now guard against a running dev server, and why the vector store must
never share the app database file.

## Required server changes

### 1. Upgrade `@m5kdev/backend`

Upgrade to a version that includes `lib/libsql.ts`. If your app passes plain
connection config to `createBackendApp` (the common case), retries are enabled
automatically — the kernel wraps the client it creates:

```ts
export const builtBackendApp = createBackendApp({
  db: {
    url: databaseUrl, // file:./local.db
    syncUrl,          // libsql://your-db.turso.io
    authToken,
    syncInterval: 60,
    readYourWrites: true,
  },
  // ...
});
```

If your app passes a **preconfigured client**, the kernel leaves it untouched.
Wrap it yourself to opt in:

```ts
import { createClient } from "@libsql/client";
import { withLibsqlRetry } from "@m5kdev/backend/lib/libsql";

const client = withLibsqlRetry(createClient({ url, syncUrl, authToken }));

export const builtBackendApp = createBackendApp({
  db: { client },
  // ...
});
```

Retries log a warning (`libsql call failed on a dead hrana stream; reconnecting
and retrying`) through the app logger, so recoveries are visible in production
logs.

**What is not retried:** statements *inside* an interactive transaction. Only
the `transaction()` open is retried — replaying half a transaction is not safe.
Keep transaction bodies short and DB-only.

### 2. Add `drizzle/guard.ts`

Create `apps/<app>/server/drizzle/guard.ts`:

```ts
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
```

The guard is a no-op for remote-only `DATABASE_URL`s and can be bypassed with
`SKIP_DB_GUARD=true`. It only probes the conventional `PORT` — a server started
on a custom port slips through, so treat it as a safety net, not a lock.

### 3. Wire the guard into every db script

Call it as the first statement of each script's main function — `seed.ts`,
`sync.ts`, `reset.ts`, and `seed.e2e.ts` if present:

```ts
import { ensureDevServerStopped } from "./guard";

async function seed() {
  await ensureDevServerStopped();
  // ...
}
```

### 4. Clean replica sync metadata in `reset.ts`

The embedded replica keeps sync state in sidecar files next to the database.
Deleting the database but keeping stale sync metadata causes WAL/sync conflicts
on the next boot. Extend the reset script:

```ts
// Sidecars include the embedded-replica sync metadata (-info, -client_wal_index);
// leaving those behind next to a recreated file causes WAL/sync conflicts.
const DB_SIDECAR_SUFFIXES = ["-shm", "-wal", "-journal", "-info", "-client_wal_index"];

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
  // ...
}
```

## AI module: vector store configuration (if using `AIModule`)

`LibSQLVector` builds its own libsql client internally — there is no API for
sharing the kernel's connection. The safe configurations are a **direct remote
connection** (production) or a **separate local file** (dev). Never point the
vector store at the app database file.

Instead of constructing `LibSQLVector` yourself, pass a config object and let
the module resolve and own it:

```ts
new AIModule({
  libs: { mastra, openrouter },
  vectorStore: {
    url: process.env.VECTOR_DATABASE_URL,       // libsql://... — always direct remote
    authToken: process.env.VECTOR_AUTH_TOKEN,
    localUrl: "file:./vector.db",               // dev-only fallback when url is unset
  },
});
```

Resolution rules (`createAiVectorStore`):

| Situation | Behavior |
| --- | --- |
| `url` set | Direct remote connection; never an embedded replica. |
| `url` unset, dev | Local file (`localUrl`, default `file:./vector.db`). |
| `url` unset, `NODE_ENV=production` | Throws — local vector files are dev-only. |
| Local file equals the app `DATABASE_URL` file | Throws — two clients on one file corrupt the WAL. |

Stores created from config are closed by the module's `shutdown` hook. A
preconfigured `LibSQLVector` instance is still accepted, but then its lifecycle
(including `close()`) stays with the caller.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `SKIP_DB_GUARD` | Set to `true` to bypass the running-server check in db scripts. |
| `VECTOR_DATABASE_URL` / `VECTOR_AUTH_TOKEN` | Remote vector database (naming is app-defined; required in production when `AIModule` has a vector store). |

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Still seeing "stream not found" errors | Client passed as a preconfigured instance without `withLibsqlRetry`; or the failure is inside an interactive transaction (not retried by design). |
| Repeated retry warnings in logs | The remote endpoint is flapping or unreachable — retries mask single restarts, not sustained outages. |
| `[drizzle] A server is listening on port ...` | Working as intended: stop the dev server before running seed/sync/reset, or use `SKIP_DB_GUARD=true` if you are certain the listener is not holding the database file. |
| WAL conflicts on boot after a reset | Reset script does not delete the sync metadata sidecars (`-info`, `-client_wal_index`); apply step 4. |
| WAL conflicts during development | A second process opened the local replica file: db scripts on a custom port, drizzle-kit studio against the local file, or a vector store sharing `DATABASE_URL`. |
| `AI vector store ... requires a remote url in production` | Set the remote vector URL in the production environment, or drop the vector store config. |

## Migration checklist

1. Upgrade `@m5kdev/backend` to a version that includes `lib/libsql.ts`.
2. If you pass a preconfigured db client, wrap it with `withLibsqlRetry`.
3. Add `apps/<app>/server/drizzle/guard.ts`.
4. Call `ensureDevServerStopped()` first in `seed.ts`, `sync.ts`, `reset.ts`, and `seed.e2e.ts`.
5. Extend `reset.ts` to delete all database sidecar files.
6. If using `AIModule` with vectors: switch `vectorStore` to the config form, set the remote URL in production, and verify the local fallback file differs from `DATABASE_URL`.
7. Restart the dev server and run a db script while it is up — confirm the script aborts with the guard warning.

## Related docs

- [Backend package](/packages/backend)
- [Telemetry migration](/guides/telemetry-migration)
- [Getting started](/guides/getting-started)
