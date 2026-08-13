# Issue tracker: Linear

Issues and specs for this repo live in Linear. Use the Cursor Linear plugin (`plugin-linear-linear` MCP) for all operations — not GitHub Issues, not `gh issue`.

This workspace uses **one Linear project per repo**. All issues for this codebase belong in this repo's Linear project. Resolve the project with `list_projects` (match this repo's name, currently `m5kdev`) and pass that `project` on create. Do not invent a second project.

## Conventions

- **Create an issue**: `save_issue` with `title`, `team`, `project` (this repo's project), and markdown `description`. Creating requires `title` and `team`.
- **Read an issue**: `get_issue` by identifier (e.g. `LIN-123`) or ID.
- **List issues**: `list_issues` scoped to this repo's project. Use `"me"` for the current assignee; `"null"` for unassigned.
- **Comment**: `save_comment` on the issue.
- **Labels**: `save_issue` with `labels` (full replace). Create missing labels with `create_issue_label` first.
- **Assign / claim**: `save_issue` with `assignee` (`"me"`, a name, email, or user ID). Pass `null` to unassign.
- **State / close**: `save_issue` with `state` (state type, name, or ID).
- **Parent / child**: `save_issue` with `parentId` (identifier or ID). Pass `null` to detach.
- **Blocking**: Linear native relations on `save_issue` — `blockedBy` / `blocks` (append-only). Remove with `removeBlockedBy` / `removeBlocks`.

Infer team and project from the Linear plugin (`list_projects`, issue payloads). Do not hardcode IDs in this file.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## When a skill says "publish to the issue tracker"

Create a Linear issue in this repo's project via `save_issue`.

## When a skill says "fetch the relevant ticket"

Run `get_issue` with the identifier or ID. If the user pasted a Linear URL, extract the identifier from it.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Destination / Notes / Decisions-so-far / Fog body. `save_issue` with `labels: ["wayfinder:map"]` and `project` set to this repo's project.
- **Child ticket**: `save_issue` with `parentId` set to the map's identifier, plus a `wayfinder:<type>` label (`research` / `prototype` / `grilling` / `task`). Once claimed, assign the ticket to the driving dev (`assignee: "me"`).
- **Blocking**: Linear's native `blockedBy` / `blocks` on `save_issue`. A ticket is unblocked when every blocker is in a completed state.
- **Frontier query**: `list_issues` for open children of the map in this project; drop any with an open blocker or an assignee; first in map order wins.
- **Claim**: `save_issue` with `assignee: "me"` — the session's first write.
- **Resolve**: `save_comment` with the answer, then `save_issue` to a completed `state`, then append a gist + link to the map's Decisions-so-far.
