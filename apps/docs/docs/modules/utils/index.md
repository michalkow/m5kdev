---
sidebar_position: 23
---

# Utils module

The backend utils module turns the shared query contracts
([schemas module](/modules/schemas)) into Drizzle fragments. Prefer
`queryList` / `matchList` on `BaseTableRepository` over assembling these by
hand.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/backend` | Query helpers: `applyPagination`, `applySorting`, `getConditionsFromFilters`, `getConditionsFromMatch`, `getGlobalSearchCondition`, `escapeLikeUserInput`. |

## Helpers

| Helper | Description |
| --- | --- |
| `applyPagination(query, limit?, page?)` | Apply `LIMIT`/`OFFSET` to a Drizzle query |
| `applySorting(query, table, sort?, order?)` | Apply `ORDER BY` from `sort`/`order` params against table columns |
| `getConditionsFromFilters(conditions, filters, table)` | List query: QueryFilter[] → `where` (unknown columns skipped) |
| `getConditionsFromMatch(conditions, match, table)` | Match query: QueryMatch → `where` (`Result`; unknown column / `$op` errors) |
| `getGlobalSearchCondition(...)` | Build the `q` substring-search condition across searchable columns |
| `escapeLikeUserInput(value)` | Escape `%`/`_` in user input before `LIKE` queries |

List query vs Match query operator rules:
[List query and Match query](/guides/list-query-and-match-query).

Keep these calls in repositories. Services pass `QueryInput` or
`MatchQueryInput` through and narrow with `.addFilters` or `.addMatch`.
