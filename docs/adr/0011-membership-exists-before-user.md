# Membership exists before User

Apps assign org-scoped work by MemberId, but invite used to create only a Better Auth Invitation, so there was no Member to stamp until accept. We create the Membership at invite (`userId` unset, email/name snapshots); accept attaches the User to that same row; cancel and expiry soft-delete like leave; re-invite revives. Invitation stays the Better Auth accept token (with `memberId`), not a person.

## Considered Options

- **Placeholder User at invite** — rejected: User is the Better Auth identity; creating one would run personal-org, billing, and waitlist hooks for someone who does not exist yet. Account claim is the opposite (User first).
- **Assign to invitationId** — rejected: MemberId is already the org ownership key; a second principal would split attribution across accept.
- **Set userId when the email already has a User** — rejected: invited means `userId` is unset, so Actor and uniqueness stay simple; in-app notify waits until accept.

## Consequences

- AuthService is the invite / accept / cancel / member-list interface; apps and web-ui do not call Better Auth organization invitation HTTP.
- One live (not soft-deleted) Membership per email per Organization; resend and re-invite revive that seat.
- Expired tokens are applied lazily on list or accept (same soft-delete as cancel). No expiry job in v1.
- Pending Invitations from before this change are not backfilled. Accept of a token with no `memberId` fails; the Organization must send a new Auth invite. That invite cancels the leftover token and creates a new Invitation plus Member.
- Platform admin add-member stays a separate path: existing User, `userId` set immediately, no Invitation.
- Auth also owns role change and remove/leave (soft-delete) for active Members. The unreleased `updateInvitationRole` path is replaced by one `updateMemberRole` for invited and active seats. `members.role` is the source of truth; Auth also copies the role onto `invitations.role` so leftover Better Auth reads stay consistent. Owner remains excluded from this picker.
