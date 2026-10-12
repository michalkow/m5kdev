# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues on `michalkow/typeorb`. Use the **GitHub MCP** (or `gh` for read-only listing) for all operations.

Identify issues by GitHub number (`#123`), never a Linear identifier.

**Owner:** `michalkow`  
**Repo:** `typeorb`

## Conventions

- **Create an issue**: GitHub `issue_write` with `method: "create"`, `owner`, `repo`, `title`, `body`, and `labels`. Use issue type `Feature` / `Bug` / `Task` when the repository supports types (`list_issue_types`). Omit `issue_number`.
- **Read an issue**: GitHub `issue_read` with `method: "get"` and `issue_number`. Also read comments when the skill asks for them (`method: "get_comments"`).
- **List issues**: GitHub `list_issues` or `search_issues` scoped to `owner` + `repo`.
- **Comment on an issue**: GitHub `add_issue_comment` with `issue_number` and `body`.
- **Apply / remove labels**: `issue_write` `method: "update"` with `issue_number` and `labels` (the full desired set). Create a missing label in the GitHub UI or via the labels API before applying it. Triage role → label strings: `docs/agents/triage-labels.md`.
- **Close**: `issue_write` `method: "update"` with `state: "closed"` and `state_reason: "completed"` (or `not_planned` / `duplicate`). Post any closing explanation as a comment first when the skill asks for one.

## Pull requests as a triage surface

**PRs as a request surface: no.** Code review and PR operations stay on GitHub PRs; do not treat pull requests as the feature-request queue. Specs and tickets are GitHub **issues**.

## When a skill says "publish to the issue tracker"

Create a GitHub issue with `issue_write` (`method: "create"`). Apply the `ready-for-agent` triage label.

If issue create is forbidden for the current token, write the spec (and tickets) under `.scratch/<feature-slug>/` and note that they must be copied into GitHub issues when the tracker is writable.

## When a skill says "fetch the relevant ticket"

Run `issue_read` (`method: "get"`) for the issue number, then `issue_read` (`method: "get_comments"`).

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `issue_write` create with that label.
- **Child ticket**: a GitHub **sub-issue** of the map — `issue_write` create with `parent_issue_number` set to the map, plus labels `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub sub-issues of the parent spec/map. Put a `Blocked by: #n, #n` line at the top of the child body (and use native blocked-by if the repo has issue dependencies). A ticket is unblocked when every blocker is closed.
- **Frontier query**: sub-issues of the map/spec whose blockers are all closed and that have no assignee; first in map order wins.
- **Claim**: `issue_write` update with `assignees` including the acting user.
- **Resolve**: comment with the answer, then close the issue (`state: "closed"`, `state_reason: "completed"`), then append a context pointer to the map’s Decisions-so-far.
