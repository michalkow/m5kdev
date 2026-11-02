# 06 — Verify and review the integrated PostgreSQL migration

**What to build:** The complete migration is independently verifiable as one integration branch, with no supported Turso/libSQL path remaining and honest evidence for consumer upgrade readiness.

**Blocked by:** 01 — Run the Kernel and app repositories on PostgreSQL; 02 — Operate migrations, seed, and reset safely; 03 — Persist Starter Conversations and embeddings in PostgreSQL; 04 — Develop and deploy generated apps with PostgreSQL; 05 — Guide agents through framework and consumer table migration.

**GitHub issue:** michalkow/m5kdev#30 (parent #24)

**Status:** ready-for-agent — blocked by #25, #26, #27, #28, and #29

- [ ] Confirm maintainer-generated PostgreSQL migrations, provisioning, and storage initialization are available.
- [ ] Run targeted and broader relevant tests, typechecks, builds, template checks, and PostgreSQL E2E smoke tests.
- [ ] Audit active dependencies/configuration/source for Turso/libSQL and redundant search-emulation remnants.
- [ ] Verify PgBouncer runtime behavior, direct migrations, reset isolation, Thread durability, and native-type roundtrips.
- [ ] Produce separate Standards and Spec review reports and fix actionable findings.
- [ ] Run the requested bug review using an available provider/tool; report any unavailable review capability rather than substituting silently.
- [ ] Resolve published tickets only after acceptance criteria pass; leave the parent spec unchanged per ticketing conventions.
