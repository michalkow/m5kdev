---
sidebar_position: 4
---

# Table module

The table module standardizes query params, filters, pagination, grouping, and
table UI behavior.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | Filter types and shared query contracts. |
| `@m5kdev/frontend` | Platform-neutral table query state, `useQueryWithParams`, and query/filter serializers. |
| `@m5kdev/web-ui` | Table controls, `nuqs` URL-state hooks, filtering, pagination, grouping, and column visibility components. |

## Migration

See [Frontend and Web UI split migration](/guides/frontend-web-ui-split) for the
current import map and migration checklist.

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
