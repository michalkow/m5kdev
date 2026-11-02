---
"@m5kdev/backend": minor
"create-m5kdev": minor
---

Replace Turso/libSQL persistence with PostgreSQL and pgvector, requiring consumers to migrate existing schemas and data and update database configuration.

Use native JSONB, scalar arrays, booleans, and timezone-aware timestamps, with native Drizzle collection operators instead of serialized-text matching.

Separate pooled runtime connections from mandatory direct migration and initialization connections, with explicit app, Mastra, and vector schema ownership and disposable-app-schema reset safeguards.

Generate PostgreSQL-ready apps with migration tooling, local PostgreSQL/pgvector and PgBouncer configuration, and durable app-owned Mastra Conversation memory with personal-resource isolation.
