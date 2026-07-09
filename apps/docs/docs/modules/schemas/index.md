---
sidebar_position: 20
---

# Schemas module

The schemas module holds cross-cutting schema primitives in `@m5kdev/commons`
that are not owned by any single feature module. Today that is the shared list
query contract.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | `query.schema.ts`: `querySchema`, `filterSchema`, `filtersSchema`, `queryListOutput`. |

## Query contract

`querySchema` defines the input every list endpoint accepts — `page`, `limit`,
`sort`, `order`, `filters`, and `q` (global substring search) — and
`queryListOutput(rowSchema)` defines the `{ rows, total }` response envelope.

`filterSchema` describes a single column filter: `columnId`, a data `type`
(`string`, `number`, `date`, `boolean`, `enum`, `jsonArray`), a `method`
(`contains`, `equals`, `between`, `oneOf`, `is_null`, …), and the `value`
(plus `valueTo` / `endColumnId` for ranges).

## Consumers

- Backend: repository helpers in the [utils module](/modules/utils) translate
  `QueryInput` into Drizzle conditions; permissioned list procedures accept it
  directly (e.g. `recurrence.list`, `workflow.list`, `tag.list`).
- Frontend: the [table module](/modules/table) serializes the same contract to
  and from URL state.

Feature-specific schemas live with their module in
`commons/src/modules/<module>/` — this module is only for primitives shared by
many modules.
