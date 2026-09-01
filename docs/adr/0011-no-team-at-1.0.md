# No Team at 1.0

Auth 1.0 has no Team. Organization is the only nested tenancy unit. Kernel `TeamActor`, Grant level `team`, Better Auth teams, `teams`/`teammembers` tables, session `activeTeam*`, and creating a Team on signup are out of the freeze surface — strip them before freeze rather than finish them. No shipping app has needed Team; inventing MemberId-keyed team Grants and Procedures just to freeze a surface would lock in a model we do not have. Kernel freeze (DEV-332) must drop `TeamActor` and Grant level `team` so 1.0 does not ship a dead Actor. Team can return later as a real product, not as leftover Better Auth tables.

## Considered Options

- **Finish Team before freeze** (MemberId on `teammembers`, team Grants, team Procedures) — rejected: no product use, and the current plugin is UserId-keyed. Freezing that shape would make the later model a breaking change.
- **Park unused tables and TeamActor** — rejected: a Semver-stable public API with an unpopulated `TeamActor` is a frozen lie.
- **Keep Better Auth teams as an undocumented extra** — rejected: signup already inserts a Team, so every Organization would still carry one.
