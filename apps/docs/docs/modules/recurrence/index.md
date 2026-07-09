---
sidebar_position: 9
---

# Recurrence module

The recurrence module stores recurring schedules and their rules so apps can
model "repeat every…" behavior (e.g. recurring content, reminders, reports) with
a shared contract.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | Recurrence create/update/delete schemas and rule schemas. |
| `@m5kdev/backend` | `RecurrenceModule`: `recurrence` and `recurrence_rules` tables, repository, permissioned service procedures, tRPC router. |

## Registration

```ts
import { RecurrenceModule } from "@m5kdev/backend/modules/recurrence/recurrence.module";

backendApp.use(new RecurrenceModule({ namespace: "recurrence" }));
```

Options: `namespace` (tRPC namespace, default `recurrence`) and `grants`
(default `defaultRecurrenceGrants`).

## Data model

- `recurrence` — the recurring entity: what repeats, for which owner/resource.
- `recurrence_rules` — one or more rules describing when it repeats.

## Service and tRPC surface

`RecurrenceService` is a `BasePermissionService`; every operation is exposed as
a service procedure and mirrored 1:1 in the tRPC router:

| Procedure | Description |
| --- | --- |
| `recurrence.list` | List recurrences (organization scope, shared query contract) |
| `recurrence.create` | Create a recurrence with rules |
| `recurrence.findById` | Read one recurrence |
| `recurrence.update` | Update recurrence fields |
| `recurrence.updateRule` | Update a rule |
| `recurrence.delete` | Delete a recurrence |
| `recurrence.deleteRule` | Delete a rule |

Executing scheduled occurrences is app-level behavior — combine this module with
the [workflow module](/modules/workflow) (cron) to act on due recurrences.
