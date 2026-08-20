---
sidebar_position: 20
---

# Schemas

Schemas is a Shared-contract surface, not a Backend Module. It holds
cross-cutting schema primitives in `@m5kdev/commons` that are not owned by any
single feature module. Today that is the shared list contracts: **List query**
(QueryFilters) and **Match query** (QueryMatch).

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | `query.schema.ts`: `querySchema`, `filterSchema`, `filtersSchema`, `queryListOutput`. `queryMatch.ts`: `matchQuerySchema`, `QueryMatch`, `queryFiltersToMatch`. |

## Two contracts

Pagination, sort, and `q` are shared. Predicates are not:

| Contract | Input schema | Predicate field |
| --- | --- | --- |
| List query | `querySchema` / `QueryInput` | `filters`: QueryFilter[] |
| Match query | `matchQuerySchema` / `MatchQueryInput` | `match`: QueryMatch |

`queryListOutput(rowSchema)` is the `{ rows, total }` envelope for both.

A QueryFilter is a UI clause: `columnId`, `type`, `method`, `value` (plus
`valueTo` / `endColumnId` for ranges). A QueryMatch is a column-keyed object
with `$eq` / `$gt` / `$contains` / `$and` / `$or` / `$not`. The converter
`queryFiltersToMatch` is a rename only.

Full operator tables, Procedure wiring, and hook behaviour:
[List query and Match query](/guides/list-query-and-match-query).

## Consumers

- Backend: Kernel infrastructure [query helpers](/modules/utils) and
  `BaseTableRepository` (`queryList` vs `matchList`). DTOs expose both via
  `createZodSchemas(table).input.list` and `.input.matchList`.
- Frontend: the [table](/modules/table) Shared-contract / UI surface keeps URL
  state as QueryFilters and also emits a QueryMatch from the converter.

Feature-specific schemas live with their module in
`commons/src/modules/<module>/` — this module is only for primitives shared by
many modules.
