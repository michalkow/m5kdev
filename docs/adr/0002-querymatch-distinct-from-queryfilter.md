# QueryMatch is not a QueryFilter encoding

List query `filters` on the Shared contract stay QueryFilters so the webapp is unchanged. Services and Repositories also accept a QueryMatch (Mongo-style object). QueryMatch uses SQL comparison semantics (`$gt` is strict; dates are instants, not calendar-day bounds) and `$and`/`$or` groups, which QueryFilter cannot express. The two encodings AND together at query application; we do not compile one into the other.

## Considered Options

- **Compile QueryMatch → QueryFilter[]** — rejected: loses `$or` and would map `$gt` onto `greater_than` / date `after`, which are a UI dialect (`gte` / startOfDay), not SQL.
- **Dual wire format on `querySchema`** — deferred. This phase is backend authoring only (`.addFilters`, `queryList`, `applyFilters`).
