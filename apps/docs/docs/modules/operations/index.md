---
sidebar_position: 18
---

# Operations module

The operations module is a reserved area in `@m5kdev/frontend` for hooks and
utilities around long-running operations (progress, polling, optimistic
updates).

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/frontend` | `modules/operations/hooks` and `modules/operations/utils` (currently empty placeholders). |

## Status

The module directories exist but contain no exports yet. For tracking
long-running backend work today, poll workflow runs through the
[workflow module](/modules/workflow) tRPC procedures (`workflow.read`,
`workflow.list`).
