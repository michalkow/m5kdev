# 04 — Develop and deploy generated apps with PostgreSQL

**What to build:** A newly generated app follows the same provider-neutral PostgreSQL+PgBouncer+pgvector contract as Starter, including local development, CI, and deployment readiness.

**Blocked by:** 02 — Operate migrations, seed, and reset safely; 03 — Persist Starter Conversations and embeddings in PostgreSQL.

**GitHub issue:** michalkow/m5kdev#28 (parent #24)

**Status:** ready-for-agent — blocked by #26 and #27

- [ ] Provide reproducible PostgreSQL/pgvector local and test infrastructure and transaction-pooling verification.
- [ ] Update environment examples, commands, scaffolding, and deployment configuration to explicit runtime/direct roles.
- [ ] Remove Turso/libSQL dependencies, file-based E2E isolation, replica volumes, and active instructions.
- [ ] Isolate integration/E2E data using actual PostgreSQL rather than a SQLite substitute.
- [ ] Ensure generated apps typecheck/build and startup uses previously initialized storage.
- [ ] Preserve app-owned migration history and require an explicit maintainer baseline plan.
