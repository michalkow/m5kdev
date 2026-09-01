# Auth tRPC owns Membership; Better Auth owns session

Membership invite, accept, cancel, list, remove, and leave are Auth Procedures (`auth.*` tRPC). The seat is the `members` row (including invited seats with `userId` unset); Invitation is only the Better Auth-shaped accept token Auth writes and accepts. Better Auth HTTP stays public for sessions, API keys, and `setActive`. Better Auth organization invite HTTP (`sendInvitationEmail` / invite endpoints) is not a 1.0 public path — it can mint a token with no Membership. Unifying all Auth onto tRPC would be a rewrite; leaving invite on Better Auth would fight Membership-at-invite.

## Considered Options

- **Keep dual invite** (Better Auth HTTP and Auth tRPC both public) — rejected: two pipes, leftover `memberId`-null tokens as a supported shape.
- **tRPC-first for everything** (sessions, API keys, setActive too) — rejected: wrapping Better Auth session is a rewrite, not a freeze item.
- **Better Auth is the member/invite API; shrink tRPC** — rejected: invite-before-User, stable MemberId, and Owner rules live in AuthService, not in the plugin.
