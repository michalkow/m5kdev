---
sidebar_position: 4
---

# Table

Table is a Shared-contract / UI surface, not a Backend Module. It standardizes
list querying end to end: shared pagination and search, frontend query-state
hooks, and web table UI driven by URL state.
URL and widgets stay **QueryFilters** (List query). Hooks also emit a
**QueryMatch** so a Procedure can opt into Match query. See
[List query and Match query](/guides/list-query-and-match-query).

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | List query (`querySchema` / QueryFilter) and Match query (`matchQuerySchema` / QueryMatch, `queryFiltersToMatch`). |
| `@m5kdev/frontend` | Platform-neutral query state: `useQueryWithParams`, `useTableQueryParams`, query param serializers. |
| `@m5kdev/web-ui` | `NuqsTable` and table controls: filtering, pagination, group-by, column order/visibility, date-range filters. |

## Shared query contract

List Procedures accept `QueryInput` from
`@m5kdev/commons/modules/schemas/query.schema`:

```ts
{
  page?: number;
  limit?: number;
  sort?: string;
  order?: "asc" | "desc";
  q?: string; // global substring search
  filters?: Array<{
    columnId: string;
    type: "string" | "number" | "date" | "boolean" | "enum" | "jsonArray";
    method: "contains" | "equals" | "between" | "oneOf" | /* ... */;
    value: string | number | boolean | string[];
  }>;
}
```

They return `{ rows, total }` (`queryListOutput`). Match query Procedures
accept `MatchQueryInput` (`page`, `limit`, `sort`, `order`, `match`, `q`)
instead of `filters`.

On the backend, [utils](/modules/utils) and `queryList` / `matchList` translate
the chosen stack into Drizzle. `useQueryWithParams` sends both `filters` and
`match` (converted from the merged QueryFilters, including `additionalFilters`).
List Zod strips `match`; Match Zod strips `filters`. Do not put QueryMatch in
the URL.

`filter.types.ts` maps each column data type to its available filter methods and
the UI control that edits them (text, number, date, range, select, multiselect).

## Query state

Use `@m5kdev/frontend` for query state that must work in both web and native
apps:

```ts
import { useQueryWithParams } from "@m5kdev/frontend/modules/table/hooks/useQueryWithParams";
import { useTableQueryParams } from "@m5kdev/frontend/modules/table/hooks/useTableQueryParams";
```

Use `@m5kdev/web-ui` when a web table should synchronize state through `nuqs`
and URL search params:

```ts
import useNuqsTable from "@m5kdev/web-ui/modules/table/hooks/useNuqsTable";
```

`useNuqsTable` builds on `useNuqsQueryParams` and feeds `NuqsTable`, which
composes the control components: `TableFiltering`, `TablePagination`,
`TableGroupBy`, `ColumnOrderAndVisibility`, `FilterHeroDateControls`, and
`RangeNuqsDatePicker` (with `useDateRangeFilter`). Filter values are converted
between URL state and the shared contract by `filterTransformers`.

## Migration

- [Frontend and Web UI split](/guides/frontend-web-ui-split) — import map after
  the `nuqs` split.
- [Match query](/guides/v0.33.0-match-query-migration) — opt a list Procedure
  from `queryList` to `matchList`.
