# 01 — Run the Kernel and app repositories on PostgreSQL

**What to build:** A PostgreSQL-only Kernel and Starter application can compose framework/app tables, initialize Auth, and execute repository operations through the runtime connection using native field types. This is a wide-refactor migration batch: shared dialect types and all dependent schemas/repositories must move together; final cross-ticket green is gated by the integration ticket.

**Blocked by:** No other ticket; maintainer-generated migrations are required before integration verification.

**GitHub issue:** michalkow/m5kdev#25 (parent #24)

**Status:** in progress — Kernel/schema conversion implemented locally; awaiting maintainer-generated PostgreSQL migrations and real-database integration verification. Acceptance criteria are not yet complete.

- [ ] Verify compatible driver/ORM/Auth dependencies and pin them through the Managed catalog.
- [ ] Use runtime PgBouncer connection with a shared, explicitly owned pool and qualified schemas.
- [ ] Migrate all framework, optional-module, and Starter schema/repository contracts to PostgreSQL.
- [ ] Apply field-level native-type mappings without breaking IDs, payloads, transactions, grants, or Workflow precedence.
- [ ] Remove redundant SQLite search-emulation helpers and use supported native Drizzle operators while preserving List/Match contracts.
- [ ] Stop for maintainer-generated migrations; never author SQL/history metadata in-agent.
- [ ] Verify agreed public behavior through red-green PostgreSQL tests; report cross-ticket blockers honestly.
