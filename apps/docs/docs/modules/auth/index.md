---
sidebar_position: 2
---

# Auth module

The auth module is the identity backbone of an m5kdev app: Better Auth wiring,
users, organizations, invitations, waitlists, Account claim, API keys, and the
settings storage (preferences, flags, metadata, onboarding) that other modules
build on.

Organizations are the **default tenancy** model: every user has at least one
membership. Soft-deleted members keep a snapshot `name` for attribution; rejoin
revives the same `memberId`. Org-scoped product data should key ownership on
that membership — see
[Organizations and members](/guides/organizations-and-members).

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | Auth schemas, role config types (`AuthRolesConfig`), locale config, request header constants. |
| `@m5kdev/backend` | `AuthModule`: DB tables, repositories, `AuthService`, Better Auth factory, Express middleware, tRPC procedures. |
| `@m5kdev/frontend` | `AuthProvider`, auth client, session/admin/organization hooks. |
| `@m5kdev/web-ui` | Complete auth route UI: login, signup, password reset, waitlist, org management, admin screens. |

## Database tables

`AuthModule` ships these Drizzle tables: `users`, `sessions`, `accounts`,
`verifications`, `organizations`, `members`, `invitations`, `apikeys`,
`waitlist`, `account_claims`, and `account_claim_magic_links`. There are no
`teams` / `teammembers` tables.

## Backend

### Registration

```ts
import { createBackendApp } from "@m5kdev/backend/app";
import { AuthModule } from "@m5kdev/backend/modules/auth/auth.module";

// depends on EmailModule; BillingModule is an optional dependency
createBackendApp(config, [new AuthModule(customGrants, serviceHooks)]);
```

Grants default to `defaultAuthGrants` (admin: all; user: own; org owner/admin:
all). Pass `AuthServiceHooks` to react to lifecycle events such as organization
creation.

### Better Auth integration

The Better Auth instance is created through the kernel `auth.factory` and comes
preconfigured with the `admin`, `organization`, `apiKey`, `magicLink`, and
`lastLoginMethod` plugins, plus email/password auth. Optional behaviors:

- **Waitlist mode** — signups require an invitation code (checked via the
  `waitlist-invitation-code` header or OAuth state); email verification is
  relaxed while the waitlist gates access.
- **Account claim** — admins pre-provision accounts and issue claim codes or
  magic links (`account_claim_magic_links`) that users redeem.

Express middleware: `createAuthMiddleware(auth)` populates `req.user` /
`req.session`; `createRoleAuthMiddleware(auth)` adds role checks.

### Roles

Role keys for `user` and `organization` are configured once via
`createBackendApp({ app: { roles } })` and mirrored to the frontend through
`AppConfigProvider`. Defaults: users `user`/`admin`, organizations
`member`/`admin`/`owner`. `AuthRolesConfig` still requires a `team` block
because Kernel Grant level `team` / `TeamActor` remain; Auth does not create
Teams. See the [custom app roles migration](/guides/custom-app-roles-migration)
and [Team drop in 0.36.0](/guides/v0.36.0-team-drop-migration).

### tRPC surface

The `auth` router covers, by area:

- **Settings** — get/set `onboarding`, `preferences`, `locale`, `metadata`, and
  `flags` at user, organization, and member scope.
- **Organizations** — `createOrganization`, `listUserOrganizations`,
  `listChildOrganizations`, `updateChildOrganization`, org preferences/flags.
- **Members and invitations** — `inviteOrganizationMember`,
  `listOrganizationMembers`, `updateMemberRole`,
  `acceptOrganizationInvitation` (authenticated User),
  `cancelOrganizationInvitation`, `removeOrganizationMember`,
  `leaveOrganization`. `readInvitation` stays public. There is no
  `updateInvitationRole`.
- **Admin Owner** — `transferOrganizationOwner`; add-member may assign Owner
  only when none exists.
- **Waitlist** — `joinWaitlist` (public), `validateWaitlistCode` (public),
  `inviteToWaitlist`, `createWaitlistCode` (not `createInvitationCode`),
  `listWaitlist` (own rows include `code`), `listAdminWaitlist` (no codes),
  plus admin add/invite/remove. Minted-code cap is 3 per User, separate from
  the emailed-invite cap of 3.
- **Account claims** — stored on `account_claims`, not Waitlist.
  `createAccountClaimCode`, `listAccountClaims`,
  `generateAccountClaimMagicLink`, `getMyAccountClaimStatus`,
  `setMyAccountClaimEmail`, `acceptMyAccountClaim`.
- **Admin** — organization CRUD, `searchAdminUsers`, member add/update/remove.

Better Auth's own HTTP endpoints stay under `/api/auth/*`.

### Server events

Services emit through Auth (`userEmit`, `batchUserEmit`, `organizationEmit`,
`emitServerEvent`), not the Kernel bus. See [Server events](/modules/server-events)
and [Workflow](/modules/workflow). Upgrade:
[Kernel Server events in 0.35.0](/guides/v0.35.0-kernel-server-events-migration).

## Frontend

`@m5kdev/frontend` exports the auth client plus hooks: `useSession`,
`useAuthClient`, `useAuthAdmin`, `useAuthLocale`, `useAuthMemberInvite`,
`useOrganizationAccess`, `useUserOrganizations`, `useUpdateUser`, and
`useUpdateUserPreferences`. Wrap the app in `AuthProvider` (composed in
`Providers.tsx` alongside `AppConfigProvider`).

## Web UI

`@m5kdev/web-ui` ships route-level routers you mount in your app router:

- `AuthPublicRouter` — login, signup, forgot/reset password, waitlist card and
  code validation, OAuth provider buttons, account claim, and
  `/organization/accept-invitation` (must stay public so a logged-out invitee
  can be sent to signup instead of bouncing inside protected routes).
- `AuthUserRouter` — profile editor, preferences, logout, invite friends.
- `AuthOrganizationRouter` — org profile, preferences, members,
  child organizations, org select.
- `AuthAdminRouter` — user management, organization management, waitlist.
- Utilities — `AuthUtilityProtectedRoutes`, impersonation banner, locale and
  theme pickers.

## Membership lifecycle

- Invite creates a live Membership (`userId` unset; email and name snapshots)
  plus an Invitation token with `memberId`. Accept attaches the User to that
  same row. Signup with an invite must not create a second personal
  Organization.
- Active membership requires `members.deletedAt` to be null. Invited Members
  are not Actors.
- Leave / remove / invite cancel / lazy expiry soft-delete the row and clear
  active org session fields for that organization. Re-invite revives
  `memberId`.
- Pending tokens without `memberId` are leftovers; accept fails until a new
  Auth invite. There is no Invitation backfill.
- Org self-service cannot grant or change Owner. A User-role `admin` transfers
  Owner (exactly one live Owner) or assigns Owner when there is none.
- `members.name` mirrors `users.name` while active and remains after leave for
  historical display.
- `members.image` mirrors `users.image` (including OAuth provider avatars on
  signup) while active and remains after leave for attribution.

Session context for org work includes `activeOrganizationId`,
`activeOrganizationRole`, and `activeOrganizationMemberId`. There is no
`activeTeamId`. Actors expose that membership as `memberId` (organization
scope requires it). Kernel `TeamActor` still exists but Auth does not stamp
team on the session.

## Migration guides

- [Organizations and members](/guides/organizations-and-members) (intended usage)
- [Member ownership migration](/guides/v0.32.0-memberid-ownership-migration)
- [Membership at invite in 0.36.0](/guides/v0.36.0-membership-at-invite-migration)
- [Account claim and Waitlist in 0.36.0](/guides/v0.36.0-account-claim-waitlist-migration)
- [Team drop and unused User payment columns in 0.36.0](/guides/v0.36.0-team-drop-migration)
- [Email preview gate in 0.36.0](/guides/v0.36.0-email-preview-gate-migration)
- [User and organization locale migration](/guides/user-org-locale-migration)
- [Admin create verified user migration](/guides/admin-create-verified-user-migration)
- [Custom app roles migration](/guides/custom-app-roles-migration)
- [Kernel Server events in 0.35.0](/guides/v0.35.0-kernel-server-events-migration)
