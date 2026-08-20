---
sidebar_position: 23
---

# Query helpers

These Drizzle helpers are Kernel infrastructure, not a Utils Backend Module.
They turn the shared query contracts ([schemas](/modules/schemas)) into
`where` / `orderBy` fragments. Prefer `queryList` / `matchList` on
`BaseTableRepository` over assembling them by hand.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/backend` | Query helpers on Kernel infrastructure: `applyPagination`, `applySorting`, `getConditionsFromFilters`, `getConditionsFromMatch`, `getGlobalSearchCondition`, `escapeLikeUserInput`. |

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
