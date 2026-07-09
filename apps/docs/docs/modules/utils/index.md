---
sidebar_position: 23
---

# Utils module

The backend utils module turns the shared query contract
([schemas module](/modules/schemas)) into Drizzle query fragments. Repositories
use these helpers so every list endpoint paginates, sorts, filters, and searches
the same way.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/backend` | Query helpers: `applyPagination`, `applySorting`, `getConditionsFromFilters`, `getGlobalSearchCondition`, `escapeLikeUserInput`. |

## Helpers

| Helper | Description |
| --- | --- |
| `applyPagination(query, limit?, page?)` | Apply `LIMIT`/`OFFSET` to a Drizzle query |
| `applySorting(query, table, sort?, order?)` | Apply `ORDER BY` from `sort`/`order` params against table columns |
| `getConditionsFromFilters(table, filters)` | Convert `QueryFilter[]` into Drizzle `where` conditions per filter type and method |
| `getGlobalSearchCondition(...)` | Build the `q` substring-search condition across searchable columns |
| `escapeLikeUserInput(value)` | Escape `%`/`_` in user input before `LIKE` queries |

## Typical repository usage

```ts
const conditions = getConditionsFromFilters(this.table, query.filters ?? []);
let stmt = this.orm.select().from(this.table).where(and(...conditions));
stmt = applySorting(stmt, this.table, query.sort, query.order);
stmt = applyPagination(stmt, query.limit, query.page);
```

Keep these calls in repositories — services pass `QueryInput` through untouched
(optionally narrowing it with helpers like `BaseService.addUserFilter`).
