# 01 — In-repo catalog lockstep: Starter catalog: pins and prune unused keys

**What to build:** The stack’s own workspace uses the managed catalog contract end to end: Starter and root templates declare every catalogued third-party as `catalog:` (including Expo — if a platform needs a different pin, bump the catalog, do not hand-pin). After that, any monorepo catalog key that no `package.json` references with `catalog:` is removed. Strict catalog mode still installs. Hygiene tests prevent unused keys and exact pins from coming back.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Every Starter and root-template third-party that exists in the monorepo catalog uses `catalog:`, not an exact or range pin (Expo included).
- [ ] If Expo cannot use the current catalog pin for a library (e.g. React), the catalog pin is bumped in this ticket rather than leaving an exact pin.
- [ ] After converting pins, every remaining monorepo catalog key is referenced with `catalog:` by at least one workspace manifest; unreferenced keys are deleted.
- [ ] Strict catalog mode install still succeeds.
- [ ] Tests fail if a catalog key has zero `catalog:` refs, or if Starter/root templates exact-pin a catalogued name.
- [ ] Existing consumer catalog derivation still covers every Starter `catalog:` dependency.
