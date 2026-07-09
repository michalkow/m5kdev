---
sidebar_position: 4
---

# Table module

The table module standardizes list querying end to end: one shared query
contract (pagination, sorting, filters, global search), frontend query-state
hooks, and web table UI driven by URL state.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | `querySchema` / `filterSchema` contracts and filter method types. |
| `@m5kdev/frontend` | Platform-neutral query state: `useQueryWithParams`, `useTableQueryParams`, query param serializers. |
| `@m5kdev/web-ui` | `NuqsTable` and table controls: filtering, pagination, group-by, column order/visibility, date-range filters. |

## Shared query contract

Every list endpoint accepts `QueryInput` from
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

and returns `{ rows, total }` (`queryListOutput`). On the backend, the
[utils module](/modules/utils) helpers (`applyPagination`, `applySorting`,
`getConditionsFromFilters`, `getGlobalSearchCondition`) translate this contract
into Drizzle queries.

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

See [Frontend and Web UI split migration](/guides/frontend-web-ui-split) for the
current import map and migration checklist.
