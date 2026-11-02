# Issue tracker: GitHub Issues

Issues and specs live in this repository's GitHub Issues. Resolve the target repository from the Git remote; use the connected GitHub tools or authenticated `gh` CLI. A separate GitHub Project is not required. Linear is not a prerequisite for publishing or implementing work.

## Conventions

- **Repository scope**: use the explicit repository on every issue operation; identify issues by `#number`, `owner/repo#number`, or their GitHub URL.
- **Publish**: create one issue for the spec and one issue per ticket, in dependency order. Apply `ready-for-agent` as required by the workflow; create missing labels before applying them.
- **Read**: fetch the full issue body and relevant comments before acting. Search existing issues before creating a replacement or retrying an uncertain creation.
- **Labels and assignment**: preserve unrelated labels and assignees when making targeted updates. Claim work by assigning the authenticated user.
- **Parent / child**: use native sub-issues when available. Otherwise link each ticket to the spec under `Parent`, with a task list on the spec linking its tickets.
- **Blocking**: use native blocking relationships when available. Otherwise list explicit issue references under `Blocked by`; a checklist alone is not a blocking relationship.
- **Completion**: close a ticket only when its acceptance criteria are satisfied. A PR may use closing references for completed work. Follow the active skill's rules on whether the parent spec may be modified or closed.
- **Unavailable access**: report missing GitHub authentication or repository permissions. Keep any local drafts clearly unpublished rather than switching trackers.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## When a skill says "publish to the issue tracker"

Create a GitHub issue in this repository and retain its returned number and URL. A local draft does not count as publication.

## When a skill says "fetch the relevant ticket"

Resolve the repository and issue number from the reference, then read the issue and relevant comments through GitHub tools or `gh issue view`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: create a `wayfinder:map` issue containing Destination / Notes / Decisions-so-far / Fog.
- **Child ticket**: link to the map using the parent/child convention above and apply `wayfinder:<type>` (`research` / `prototype` / `grilling` / `task`).
- **Frontier**: consider open children in map order; exclude assigned tickets and those with any unresolved blocker. An issue closed as not planned does not establish that its blocking requirement was satisfied.
- **Claim**: assign the authenticated user before beginning ticket work.
- **Resolve**: comment with the answer and evidence, close the completed ticket, then append a gist and ticket link to the map's Decisions-so-far.
