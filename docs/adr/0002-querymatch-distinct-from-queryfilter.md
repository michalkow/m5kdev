# QueryMatch is not a QueryFilter encoding

List query `filters` on the Shared contract stay QueryFilters so the webapp is unchanged. Services and Repositories accept a QueryMatch: SQL comparison semantics (`$gt` is strict; dates are instants), `$like`, and `$and`/`$or`/`$not`.

When `.addFilters` (and `applyFilters`) sees QueryFilters, it converts them to a QueryMatch, preserving the SQL those clauses already produce (`greater_than` → `$gte`, date `after` → `$gte` startOfDay), then extends that QueryMatch with the new one. We never compile QueryMatch → QueryFilter: `$or` and strict `$gt` have nowhere to go.

## Considered Options

- **Compile QueryMatch → QueryFilter[]** — rejected: loses `$or` and would map `$gt` onto the UI dialect.
- **AND both encodings at SQL without converting** — rejected: `.addFilters` should extend a QueryMatch, not keep two lists.
- **Dual wire format on `querySchema`** — deferred. This phase is backend authoring only.
