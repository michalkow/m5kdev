# Catalog lockstep and boundary peers

Scaffolded apps share the framework release’s third-party pins (the Managed catalog). Boundary libraries are peers of published `@m5kdev/*` packages so TypeScript sees one physical copy: Drizzle `Column` has `protected config`, so two `drizzle-orm` installs of the same version are unrelated classes and FK `.references()` fails. OpenTelemetry is not an app-facing peer; Starter server still pins `@opentelemetry/api` so drizzle’s optional OTEL peer cannot split a second copy.

The version promise is lockstep with the framework release, not “apps may run a newer compatible minor.” Scaffolded apps keep framework pins in the named pnpm catalog `catalogs.m5kdev` (`catalog:m5kdev` in package.json). `m5kdev update` advances that block; app-owned pins stay in the default `catalog:`. Doctor still errors on `CATALOG_VERSION_MISMATCH`.

## Considered Options

- **Apps may run a newer compatible minor of drizzle than the Kernel** — rejected: two physical copies break FK types even at the same version; a newer app drizzle is a second copy by design.
- **pnpm `overrides` / `packageExtensions` to force one drizzle** — rejected: hides the peer contract; apps still import these libraries and must declare them.
- **Declare OpenTelemetry as a Boundary library** — rejected: apps should not think about OTEL for table types. Starter server pins `@opentelemetry/api` at the catalog version instead.
- **Exact or range pins in Starter when Expo cannot use the catalog pin** — rejected: bump the catalog; Expo uses `catalog:` like the rest of Starter.
- **Doctor warns instead of errors on catalog version mismatch** — rejected: lockstep is the contract.
- **Keep unused monorepo catalog keys as a convenience superset** — rejected: unused keys drift; prune keys with zero `catalog:` refs.
- **Flat default `catalog:` plus three-way merge of mixed keys** — rejected for generated apps: app-owned pins would share the map `m5kdev update` owns. Named `catalogs.m5kdev` is the framework block; the default catalog is the app’s.
