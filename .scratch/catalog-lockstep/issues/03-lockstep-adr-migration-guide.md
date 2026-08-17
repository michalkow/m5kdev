# 03 — Lockstep ADR and migration guide

**What to build:** Maintainers and app developers can see why lockstep exists and how to move with it. An ADR records catalog lockstep plus boundary peers versus “bring your own newer drizzle.” A migration guide tells managed apps to upgrade the CLI and run `m5kdev update` so managed catalog pins follow the framework release; it covers declaring missing peers and the server OpenTelemetry pin. Docs say `m5kdev update` advances third-party pins — not `pnpm update --latest`. Glossary terms (managed catalog, consumer catalog, boundary library) land in CONTEXT.md only if they are domain language; CLI mechanics stay out.

**Blocked by:** 01 — In-repo catalog lockstep; 02 — One physical copy at the type boundary.

**Status:** ready-for-agent

- [ ] ADR records the lockstep + peers trade-off and the rejected “newer compatible minor” promise.
- [ ] Migration guide covers managed `update` for catalog pins, peer installs, and the server OpenTelemetry pin; confirm the published version number before naming the guide.
- [ ] Docs tell developers not to run a blanket latest update for stack libraries.
- [ ] CONTEXT.md stays a glossary if new terms are added; no catalog/CLI implementation dump.
