# 02 — One physical copy at the type boundary

**What to build:** Scaffolded apps and Starter share one physical copy of each boundary library at the catalog pin. Published `@m5kdev/*` packages declare those libraries as peers (and keep them as devDependencies so the monorepo still builds). Starter already installs them via `catalog:`. Starter server also declares `@opentelemetry/api` via `catalog:` so optional OpenTelemetry peers cannot split a second `drizzle-orm` of the same version. Consumer catalog derivation and peer-declaration tests lock the contract.

Boundary libraries: `drizzle-orm`, `drizzle-zod`, `zod`, `neverthrow`, `@trpc/server`, `@trpc/client`, `react`, `react-dom`, `better-auth`, `express`, `@heroui/react`, `nuqs`. Non-boundary Kernel deps stay nested.

**Blocked by:** 01 — In-repo catalog lockstep (so prune cannot drop a key Starter is about to start referencing).

**Status:** ready-for-agent

- [ ] Relevant published `@m5kdev/*` manifests list the agreed boundary libraries as `peerDependencies`, not `dependencies`.
- [ ] Those packages still build in the monorepo (peers available via `devDependencies` or workspace catalog).
- [ ] Starter (and thus the consumer catalog) installs each boundary library at the catalog pin.
- [ ] Starter server declares `@opentelemetry/api` as `catalog:`.
- [ ] Consumer catalog derivation tests include the new keys.
- [ ] Tests fail if a boundary library is nested as a published dependency instead of a peer.
