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
| `@m5kdev/module-clay` | `ClayModule`: typed table config, repository, `ClayService`. |

## Registration

Declare your Clay tables once, keyed by name:

```ts
import { createBackendApp } from "@m5kdev/backend/app";
import { WebhookModule } from "@m5kdev/backend/modules/webhook/webhook.module";
import { ClayModule } from "@m5kdev/module-clay";

createBackendApp(config, [
  new ClayModule({
    tables: {
      enrichment: {
        webhookUrl: "https://api.clay.com/v3/sources/webhook/...",
        schema: resultSchema,       // optional zod validation of the response
        timeoutInSeconds: 120,      // optional
      },
    },
  }),
  new WebhookModule(),
]);
```

Table keys are typed (`ClayModule<"enrichment">`), so `sendToTable` only accepts
configured tables. `ClayModule` `dependsOn` Inbound callback in the Kernel
(`id` remains `webhook`).

## Service API

| Method | Description |
| --- | --- |
| `sendToTable(table, row)` | POST a row to the table's Clay webhook |
| `waitForResponse<T>(...)` | Send and await Clay's callback via `WebhookService.waitForRequest`, validated against the table schema |
