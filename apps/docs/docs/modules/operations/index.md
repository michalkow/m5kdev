---
sidebar_position: 18
---

# Operations

Operations is a reserved Shared-contract / UI area in `@m5kdev/frontend`, not a
Backend Module. It is for hooks around long-running operations (progress,
polling, optimistic updates). There is no Kernel operations export.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/frontend` | `modules/operations/hooks` and `modules/operations/utils` (currently empty placeholders). |

## Status

The module directories exist but contain no exports yet. For tracking
long-running backend work today, poll workflow runs through the
[workflow module](/modules/workflow) tRPC procedures (`workflow.read`,
`workflow.list`).
