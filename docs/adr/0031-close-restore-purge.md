# Close, Restore, and Purge replace Better Auth deleteUser

User and Organization removal is a restorable lockout (**Closed**), not Membership soft-delete and not Better Auth `deleteUser`. A Closed User cannot sign in. A Closed Organization cannot be used and is hidden from product UI. Only an AdminActor **Restores**, and only while the row is still Closed. After a grace window (Auth constructor, default 30 days, File-shaped), **Purge** permanently removes the row. Danger zone in User/Organization preferences confirms in-app (type email or org name, no email). Close User: self or AdminActor. Close Organization: Owner or AdminActor. Organization Role admin cannot Close.

If Workflow is registered, one daily sweep Purges: child Organizations before parents, Organizations before Users; apps may hook extra cleanup on that sweep. Without Workflow, Closed rows stay until Restore or Admin Purge. Admin may Purge immediately. A User who still Owns an Organization cannot be Purged (and cannot Close their User until those orgs are Closed or Owner is transferred), except User Close also Closes Organizations they Own when they are the only Member. Owner Membership stays until the Organization is Purged, even if that Owner User is Closed; other seats and pending invites leave on Organization Close. User Close leaves non-Owner seats; Restore does not revive them. Slug and email stay taken until Purge. Stripe Subscription cancels at Organization Close and does not resurrect on Restore; block Closing a parent that still has live children. Closed Organizations still count for currency until Purge.

## Considered Options

- **Keep Better Auth deleteUser** (verify-email then hard-delete) beside Close — rejected: two removal paths; Admin `removeUser` Closes instead.
- **Self-serve Restore** (email link or login interstitial) — rejected: Restore is Admin panel only.
- **Call it soft-delete** — rejected: Membership already soft-deletes on leave/cancel/expiry.
- **Per-delete Workflow job** — rejected: same as File ([ADR-0030](0030-file-is-inventoried-s3-object.md)); one scheduled sweep.
- **Leave every Membership on Organization Close, including Owner** — rejected: an Organization has exactly one Owner, and Closed orgs still freeze that User’s currency.
- **Cancel Stripe at Purge, not Close** — rejected: today’s `beforeDeleteOrganization` already cancels at delete; Close is that moment.

## Consequences

- Replace `/api/auth/delete-user` and the account-deletion verification email with in-app Close.
- OrganizationActor and `setActive` refuse a Closed Organization; User Close revokes sessions, API keys, and MCP tokens.
- Signup still creates an Organization; a User may later have none that are usable.
