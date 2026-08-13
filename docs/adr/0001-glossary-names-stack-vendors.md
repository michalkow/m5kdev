# Glossary names stack vendors and durable shape

m5kdev's domain is the stack itself, not a product on anonymous infrastructure. `/domain-modeling` says `CONTEXT.md` must be devoid of implementation details; we name vendors (Better Auth, Stripe, BullMQ, libSQL/Drizzle, S3) and durable shape (`members`, Workflow run statuses, File upload statuses, MemberId stamping) in the glossary on purpose so a later grill does not strip them. Layer rules, commands, and architecture inventories stay out of `CONTEXT.md` — those live in `AGENTS.md`, `README.md`, and the environment.

## Considered Options

- **Skill-pure glossary** (no vendors, no tables) — rejected: agents invent a second auth or billing noun.
- **Operating map** (old `CONTEXT.md`: architecture + patterns + commands) — rejected: duplicates `AGENTS.md` / `README.md` / `package.json` and makes `/grill-with-docs` treat the file as a spec.
