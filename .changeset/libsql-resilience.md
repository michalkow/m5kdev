---
"@m5kdev/backend": minor
"create-m5kdev": patch
---

Harden libsql connection handling:

- The backend kernel now wraps the libsql client it owns with `withLibsqlRetry`, which reconnects and retries top-level calls that fail on dead hrana streams (remote sqld/Turso restarts or expired streams). Caller-provided clients are used as-is.
- `AIModule` accepts a `vectorStore` config object resolved via `createAiVectorStore`: remote URLs are always used as direct connections, a local file is a dev-only fallback (rejected in production and when it would share the app database file), and module shutdown closes stores it created.
- Starter/template drizzle scripts (`seed`, `sync`, `reset`, `seed.e2e`) refuse to run against the local database file while the dev server is listening (override with `SKIP_DB_GUARD=true`), and `reset` now also removes embedded-replica sync metadata sidecars.
