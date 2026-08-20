---
sidebar_position: 2
title: Organizations and members
description: How m5kdev treats organizations as the default tenancy model, and when to key ownership on memberId vs userId.
---

# Organizations and members

## Summary

Every authenticated user in an m5kdev app belongs to at least one **organization**.
That is the default tenancy model — not an optional multi-tenant add-on.

A membership is a durable `members` row (`userId` + `organizationId` + `role`).
Org-scoped product data should attribute and authorize against **`memberId`**
(the membership), not the global user account. Personal resources that are not
tied to an org stay on **`userId`**.

Single-user products still create an organization at signup. The org can stay
invisible in the UI; the membership still exists and is the correct ownership
principal for app assets.

## Why organizations are default

| Concern | Framework default |
| --- | --- |
| Isolation | Data is scoped by `organizationId` (and often `teamId`). |
| Roles | Organization roles (`member` / `admin` / `owner`, or app-defined keys) drive grants. |
| Session | `activeOrganizationId`, `activeOrganizationRole`, and `activeOrganizationMemberId` define the current tenancy. |
| Growth path | Adding a second org, invitations, or teams does not require re-keying ownership from user → member. |

If you model “my stuff” only as `userId`, a user who joins two orgs cannot keep
separate ownership, and leaving an org breaks attribution on historical rows.

## Invisible organization (single-user apps)

For products that never show org switchers or member lists:

1. Keep the bootstrap organization created at signup.
2. Always operate with an active organization session (the starter and auth
   module already set one).
3. Hide org UI routes; do not skip creating the membership.
4. Still stamp `memberId` / `organizationId` on org-scoped tables so you can
   expose multi-user later without a data rewrite.

## Member vs user ownership

### Use `memberId` for org-scoped assets

Examples: files, tags, recurrence rules, posts, and any app table that lives
inside an organization.

On create:

```ts
await this.repository.item.create({
  ...input,
  userId: ctx.actor.userId, // optional audit / legacy dual-write
  memberId: ctx.actor.memberId,
  organizationId: ctx.actor.organizationId,
});
```

Prefer the column name `memberId` on org-scoped tables (not aliases like
`authorMemberId`).

On authorize (grants with user-level `"own"`):

```ts
.access({
  action: "write",
  entities: ({ state }) => ({
    userId: state.item.userId,
    memberId: state.item.memberId,
    organizationId: state.item.organizationId,
  }),
})
```

In organization context, the grant engine prefers `memberId` for `"own"` checks.
`ownership: "member"` on an entity means **member-owned** (authorize via
`memberId`), not the literal role name `"member"`.

List filters for “my items in this org” should include member context:

```ts
.requireAuth("organization")
.addContextFilter(["member", "organization"])
```

`addContextFilter(["member", "organization"])` for member-owned lists. Use
`["user", "organization"]` only when you intentionally filter by `userId` within
an organization (it does not remap to `memberId`).

### Use `userId` for personal resources

Keep `userId` (and user-level grants) for resources that are not org tenancy:

- Billing / Stripe customer linkage
- Notification devices
- OAuth accounts and sessions
- User-global preferences that are intentionally cross-org

Do not put those on `memberId` unless the product truly wants them to reset or
fork per organization.

## Membership lifecycle

| Event | Behavior |
| --- | --- |
| Join / invite accept | Insert a `members` row, or **revive** a soft-deleted row for the same `(userId, organizationId)` so `memberId` is stable. |
| Leave / remove | Soft-delete (`deletedAt`); do not hard-delete by default. |
| Display name / image | `members.name` and `members.image` are snapshots. Active members stay in sync with `users.name` / `users.image` (including OAuth avatars on signup); after leave, the snapshots remain for attribution. |
| Active session | Soft-deleted memberships cannot be the active organization. Org/team actor scopes require `memberId`. |

Historical rows that reference a soft-deleted `memberId` keep working for
read/attribution. Active member lists and role lookups exclude `deletedAt IS NOT NULL`.

## Actors and procedures

- Organization and team scopes require `memberId` on the actor.
- Prefer `.requireAuth("organization")` for org-scoped procedures.
- Prefer stamping `ctx.actor.memberId` rather than looking up the
  member id ad hoc in each handler.

See [Kernel infrastructure (Base)](/modules/base) for actors and grants, and the
[auth module](/modules/auth) for membership APIs.

## Related guides

- [Member ownership migration](/guides/v0.32.0-memberid-ownership-migration) —
  upgrade path for existing apps (schema, backfill, service cutover).
- [Custom app roles migration](/guides/custom-app-roles-migration) — configuring
  organization and team role keys.
