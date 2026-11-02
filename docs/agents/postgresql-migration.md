# PostgreSQL consumer migration — agent handoff

This is an implementation handoff, not a released migration guide. The target
breaking-release version and maintainer review of the generated PostgreSQL
baseline are still required before release. ADR-0033 records the accepted ownership contract.

## Verified implementation contract

- Managed dependencies: `pg` / `@types/pg` 8.23.1, `@mastra/pg` 1.16.0,
  `@mastra/memory` 1.9.0, `@mastra/core` 1.51.0, Drizzle ORM 0.45.2 and
  drizzle-kit 0.31.10. Remove direct `@libsql/client` and `@mastra/libsql`
  dependencies/catalog pins. The root pnpm override removes Drizzle's unused
  optional libSQL peer. Version 1.18.1 of `@mastra/pg` fails at runtime with this
  Core version despite its declared peer range; do not substitute it.
- Runtime uses `DATABASE_URL` through transaction-mode PgBouncer. Drizzle config,
  Kernel `runDb` commands, and administrative initialization require
  `DATABASE_DIRECT_URL`; there is no fallback to the runtime endpoint.
- One database per app/environment. `DATABASE_SCHEMA` defaults to `app` and is
  app-migration-owned. `MASTRA_DATABASE_SCHEMA=mastra` and
  `VECTOR_DATABASE_SCHEMA=vectors` have separate ownership. Keep these distinct.
- Starter optionally accepts separate `MASTRA_DATABASE_URL`,
  `MASTRA_DATABASE_DIRECT_URL`, `VECTOR_DATABASE_URL`, and
  `VECTOR_DATABASE_DIRECT_URL`. These do not require separate databases.
- Provision pgvector in `public` before initialization. This avoids adapter
  session-level search-path assumptions under transaction pooling. Keep the
  adapters' supported `mastra_` storage names; do not modify vendor internals.
- `src/schema.ts` remains the app table composition root. `src/drizzle.schema.ts`
  re-exports it plus the configured PostgreSQL schema for Drizzle DDL discovery.
  Migration history starts in `drizzle-postgresql`, not the historical SQLite
  `drizzle` directory. Never rewrite old history to look PostgreSQL-native.
- Run reviewed app migrations, then `mastra:init`, then seed, then normal startup.
  Startup checks readiness; it does not generate or apply app migrations.
- `runDb` accepts `migrate`, `seed`, and `reset`; replica `sync` is removed.
  Reset requires `DATABASE_DISPOSABLE=true`, truncates app-owned tables with
  `RESTRICT`, retains table structures/migration history, and preserves other
  schemas. Cross-schema dependencies make it fail rather than cascading.
- Starter Memory is app-owned. Thread resource is UserId; Thread id is Conversation
  id. Semantic recall is disabled. The explicit embedding/upsert example uses
  `openai/text-embedding-3-small`, 1536 dimensions, cosine, and the
  `mastra_embeddings` index; changing these requires an explicit data plan.

## Disposable local development

The Starter ships `apps/starter/shared/compose.yaml` (generated apps use
`apps/shared/compose.yaml`) with PostgreSQL 17, pgvector, and transaction-mode
PgBouncer. Credentials in these files are local examples only. Docker Compose
was not available in the implementation environment; this configuration still
needs a container smoke test.

```sh
docker compose -f apps/starter/shared/compose.yaml up -d --build
export DATABASE_URL=postgresql://m5kdev:m5kdev@127.0.0.1:6432/m5kdev
export DATABASE_DIRECT_URL=postgresql://m5kdev:m5kdev@127.0.0.1:5432/m5kdev
psql "$DATABASE_DIRECT_URL" -v ON_ERROR_STOP=1 -c 'CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public'
```

After the maintainer generates and reviews the PostgreSQL baseline, run
`drizzle:migrate`, `mastra:init` (AI only), and `drizzle:seed` in the server
package. For a generated app replace `@starter-app/server` with its package name.
Do not use `drizzle-kit push` against an existing production database as a
substitute for reviewed migrations or a data transfer.

Integration tests require an explicitly disposable database with pgvector in
`public`. Set both `TEST_DATABASE_URL` (pooled runtime) and
`TEST_DATABASE_DIRECT_URL` (direct admin), then run
`pnpm --filter @m5kdev/backend test --runInBand`. The tests create isolated schemas
and drop their fixtures. E2E uses `E2E_DATABASE_URL`, `E2E_DATABASE_DIRECT_URL`,
and `E2E_DATABASE_DISPOSABLE=true`; provision distinct databases for the profile
suffixes in `apps/starter/e2e/servers.ts` before starting it. Never point these
variables at production or retained customer data.

## Copyable AI-agent prompt

```text
Migrate this m5kdev consumer application from Turso/libSQL/SQLite to the
PostgreSQL-only release. Work from the actual installed target framework and
its versioned migration guide, ADR-0033, and this app's AGENTS.md. Preserve
production data and the app's composition, layering, grants, and public APIs.
Do not assume a database reset, zero-downtime migration, or new tenancy model.

1. Inspect and report before editing.
   - Resolve the target framework release and the app's starting versions.
   - Inventory EVERY framework table composed by the app and EVERY app-owned
     table, including custom modules, optional modules, OAuth, background-job
     logs, association tables, and any stores outside the default schema file.
   - Separately inventory app-owned Mastra storage and vector indexes. Record
     their owners, schemas, credentials/connection roles (never print secrets),
     embedding models, dimensions, metrics, and whether data must be retained.
   - Produce a table/column mapping with source representation, target native
     type, null/default semantics, keys/indexes/FKs, conversion, and validation.
     No table or field may be omitted because it is outside the framework.

2. Migrate schema and queries together.
   - Use Drizzle pg-core and node-postgres, schema-qualified app tables, shared
     Pool ownership, native booleans and timestamptz Date values. Keep text IDs,
     including non-UUID values, and preserve association tables and constraints.
   - Convert structured JSON documents to JSONB and true homogeneous scalar
     collections to typed PostgreSQL arrays. Keep heterogeneous/nested values
     and scalar-or-array unions as JSONB unless the public contract is changed
     explicitly. Do not infer types merely from JSON-looking text.
   - Decode legacy serialized JSON exactly once; distinguish SQL NULL, JSON
     null, empty strings, empty arrays, and missing fields. Inventory malformed
     values and stop for a data-repair decision rather than silently dropping
     or coercing them. Validate timestamp units/timezones and large integers.
   - Remove text serialization/parsing at persistence boundaries where the
     native column now owns it. Test JSON-looking scalar strings: node-postgres
     already parses JSONB, and Drizzle's built-in mapper can reparse strings.
     The framework jsonbValue column is for arbitrary JSON scalar payloads.
   - Delete serialized-text LIKE searches and other SQLite emulation. Use
     Drizzle arrayContains, arrayOverlaps, inArray, and native comparisons.
     For JSONB containment without a Drizzle helper, use parameterized @>
     expressions with JSON parameters, not string interpolation or text casts.
   - Keep QueryFilter and QueryMatch distinct. Collection containment/overlap
     is not scalar SQL IN. Preserve documented wildcard/null/empty behavior;
     UI/global searches use ILIKE while explicit $like remains case-sensitive.
   - Preserve tx usage throughout transactions, Auth provider 'pg', Workflow
     write-behind precedence, and personal Conversation resource ownership.

3. Replace infrastructure without enabling hidden migrations.
   - Remove all runtime/test/scaffold libSQL clients, retry helpers, replica sync,
     local database-file defaults, Turso secrets, and obsolete volume mounts.
   - Configure runtime DATABASE_URL separately from mandatory DATABASE_DIRECT_URL.
     Require direct settings for Drizzle and initialization, never fall back.
   - Give app migrations the app schema only. Keep Mastra storage and vector
     schemas distinct, with supported mastra_ names and explicit pool cleanup.
     Separate adapter URLs are optional. Use supported lifecycle APIs only.
   - Provision pgvector in public, initialize Mastra using direct credentials,
     and prepare explicit vector indexes before starting runtime workers/HTTP.
     Runtime must report missing structures rather than creating them.
   - Configure app-owned durable Memory only where required by the release.
     Do not revive chats.conversation, broaden tenancy, or add retrieval APIs.
   - Update catalogs/peer contracts in lockstep, environment examples, seeds,
     CLI feature stripping/update policies, local setup, CI, deployment and E2E.
     Keep secrets server-only and leave unrelated functionality unchanged.

4. Stop at human migration and production checkpoints.
   - Do not generate or hand-author Drizzle SQL, journals, or snapshots. Present
     the completed schema diff and ask the maintainer to run the app's migration
     generation command. Keep old SQLite history intact and review the fresh
     PostgreSQL baseline before applying it to an authorized disposable target.
   - Plan an explicit source-to-target data transfer: backup/restore proof,
     dependency ordering, reproducible conversion, batching, idempotency,
     constraint validation, and separate Mastra/vector data handling. Preserve
     IDs and embedding metadata; copy compatible vectors or obtain approval
     to regenerate incompatible ones. Report rows rejected by conversion.
   - Obtain a production cutover decision: write freeze/downtime, final delta,
     validation thresholds, rollout order, credential roles, and rollback owner.
     Retain source and backups through the agreed rollback window. A code revert
     alone does not undo writes made after the PostgreSQL cutover.
   - Never run reset against production. Disposable reset affects only app data;
     Mastra/vector deletion requires a separate explicit instruction.

5. Validate and report evidence.
   - Use real PostgreSQL+pgvector and transaction-mode PgBouncer, no SQLite mock.
   - Exercise Auth, repository List/Match, transactions/rollback, Workflow event
     ordering, JSON objects/scalars/nulls, typed arrays including quotes,
     backslashes and wildcard characters, dates/timezones, text IDs, and counts.
   - Verify Conversation messages survive restart and remain resource-scoped;
     verify embedding upserts, dimension errors, startup readiness and shutdown.
   - Test direct-vs-runtime configuration, missing direct URL, rejected sync,
     guarded reset and preservation of Mastra/vector data. Run install,
     typechecks/builds, relevant tests, generated-app checks and E2E smoke tests.
   - Compare source/target row counts, orphan/uniqueness checks, representative
     field values and domain totals before cutover. Record exact commands and
     results, remaining manual checkpoints, and any unverified requirement.
```

## Maintainer checklist

- Select the coordinated breaking version for all publishable packages and write
  its versioned migration guide using the docs-site authoring instructions.
- Review the full framework/app mapping and explicitly identify retained datasets.
- Generate and review the PostgreSQL baseline; no agent-generated history.
- Apply it to a disposable target through the direct endpoint and initialize Mastra.
- Verify data conversion, backups, pooling, resource isolation and rollback steps.
- Run integrated generated-app/E2E checks against the reviewed migration artifacts.
- Schedule the production cutover separately; package publication is not implied.
