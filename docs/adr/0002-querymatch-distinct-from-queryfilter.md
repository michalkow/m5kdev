# QueryMatch is a parallel stack, not a queryList dialect

QueryFilter stays the table UI / URL dialect and the List query contract (`queryList`, `queryFind`, `.addFilters`) so existing apps keep working. QueryMatch is a Mongo-style predicate language on a separate Match query contract: `matchList`, `matchFind`, `.addMatch`.

QueryMatch carries both SQL operators (`$gt` is strict, `$like`, `$in`) and table UI operators (`$contains`, `$after`, `$greater_than` as today’s `gte`, `$intersect`, …). The commons converter QueryFilter → QueryMatch is a rename into those `$` methods, not an expansion into `$gte` / startOfDay — `matchList` applies UI-operator semantics using the table column.

`.addMatch` is a map: it receives the current QueryMatch and returns the next. Authors extend with spread (`{ ...match, memberId }`). There is no automatic merge.

List hooks still hold QueryFilters for tables. They also emit a QueryMatch. The caller passes `filters` to `queryList` or `match` to `matchList`.

## Considered Options

- **Dual encoding on `queryList` / `.addFilters` (convert-then-extend)** — rejected: the compatibility tax inside one API hurts more than a second stack.
- **Backend-only QueryMatch, Shared contract unchanged** — rejected: hooks should emit QueryMatch so the UI-to-SQL path is Match query.
- **Compile QueryMatch → QueryFilter[]** — rejected: loses `$or` and strict `$gt`.
- **`.addMatch` auto-merges / `$and`s** — rejected: the resolver returns the whole next QueryMatch; spread order is the author’s.
