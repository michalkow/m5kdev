---
sidebar_position: 13
---

# Clay module

The clay module integrates with [Clay](https://clay.com) tables: it sends rows to
Clay webhook endpoints and waits for enrichment results to come back via the
webhook module.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/backend` | `ClayModule`: typed table config, repository, `ClayService`. |

## Registration

Declare your Clay tables once, keyed by name:

```ts
import { ClayModule } from "@m5kdev/backend/modules/clay/clay.module";

backendApp.use(
  new ClayModule({
    tables: {
      enrichment: {
        webhookUrl: "https://api.clay.com/v3/sources/webhook/...",
        schema: resultSchema,       // optional zod validation of the response
        timeoutInSeconds: 120,      // optional
      },
    },
  })
);
```

Table keys are typed (`ClayModule<"enrichment">`), so `sendToTable` only accepts
configured tables. Depends on the [webhook module](/modules/webhook).

## Service API

| Method | Description |
| --- | --- |
| `sendToTable(table, row)` | POST a row to the table's Clay webhook |
| `waitForResponse<T>(...)` | Send and await Clay's callback via `WebhookService.waitForRequest`, validated against the table schema |
