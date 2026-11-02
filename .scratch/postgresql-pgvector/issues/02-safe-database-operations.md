# 02 — Operate migrations, seed, and reset safely

**What to build:** Developers can migrate via the direct connection and operate an HTTP-free Database command runner without risking Mastra/vector data or accidentally using the runtime connection for migrations.

**Blocked by:** 01 — Run the Kernel and app repositories on PostgreSQL.

**GitHub issue:** michalkow/m5kdev#26 (parent #24)

**Status:** ready-for-agent — blocked by #25

- [ ] Require the direct migration connection explicitly and keep runtime/direct roles server-only.
- [ ] Remove replica-sync behavior, options, and command scripts rather than replacing them with schema push.
- [ ] Seed through an explicitly owned PostgreSQL command context without starting HTTP/Redis/queues.
- [ ] Reset only the app schema after an explicit disposable-environment declaration.
- [ ] Preserve Mastra and vector schemas, and reject unsafe or ambiguous reset targets.
- [ ] Keep migrations app-owned and verify safety through the agreed command seam.
