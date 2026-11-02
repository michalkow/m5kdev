# 05 — Guide agents through framework and consumer table migration

**What to build:** Consumer developers receive a copyable AI-agent migration prompt and maintainer checklist covering every framework and app-owned table, native types, query changes, safe data transfer, and rollback.

**Blocked by:** 03 — Persist Starter Conversations and embeddings in PostgreSQL; 04 — Develop and deploy generated apps with PostgreSQL.

**GitHub issue:** michalkow/m5kdev#29 (parent #24)

**Status:** ready-for-agent — blocked by #27 and #28

- [ ] Inventory framework/app tables and classify documents, homogeneous arrays, and relational associations field by field.
- [ ] Preserve IDs and API contracts while directing agents to replace serialized-text search workarounds.
- [ ] Require backups, explicit transfer mappings, validation, production cutover planning, and rollback.
- [ ] Require explicit disposable-environment approval before destructive reset and human generation of migrations.
- [ ] Explain runtime/direct connections, schema ownership, Mastra initialization, and pgvector setup.
- [ ] Update active documentation and glossary to the implemented architecture; mark historical guidance superseded.
- [ ] Describe coordinated breaking-release upgrades without inventing a version or publishing packages.
