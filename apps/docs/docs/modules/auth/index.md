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
`teams` / `teammembers` tables. OAuth/JWKS tables live in `auth.oauth.db` and
are composed into App schema only when [McpModule](/modules/mcp) is registered.

`createBetterAuth` always registers Better Auth's `apiKey` plugin, so `apikeys`
must match that plugin schema even if the app never mints keys:
`configId` (required, default `"default"`), `referenceId` (required owner id;
User by default), and nullable `userId` (Better Auth never writes it). Existing
rows keep `user_id` and copy it onto `reference_id` when migrating.

## Backend

### Registration

```ts
import { createBackendApp } from "@m5kdev/backend/app";
import { AuthModule } from "@m5kdev/backend/modules/auth/auth.module";

// depends on EmailModule; BillingModule and WorkflowModule are optional
createBackendApp(config, [
  new AuthModule({
    grants: customGrants,
    hooks: serviceHooks,
    closeAfterDays: 30,
  }),
]);
```

Grants default to `defaultAuthGrants` (admin: all; user: own; org owner/admin:
all). The `(grants, hooks)` constructor still works. Pass `AuthServiceHooks` to
react to lifecycle events such as organization creation and Purge (`afterPurgeUser`,
`afterPurgeOrganization`). `closeAfterDays` defaults to 30; values below 1 fail
at boot when Workflow is present.

### Better Auth integration

The Better Auth instance is created through the kernel `auth.factory` and comes
preconfigured with the `admin`, `organization`, `apiKey`, `magicLink`, and
`lastLoginMethod` plugins, plus email/password auth. Optional behaviors:

- **Waitlist mode** — signups require an invitation code (checked via the
  `waitlist-invitation-code` header or OAuth state); email verification is
  relaxed while the waitlist gates access.
- **Account claim** — admins pre-provision accounts and issue claim codes or
  magic links (`account_claim_magic_links`) that users redeem.
- **MCP OAuth** — when [McpModule](/modules/mcp) is registered, Auth also
  registers jwt + MCP + CIMD. MCP clients (Cursor, Claude Desktop) use Better
  Auth MCP OAuth, not API keys and not the webapp cookie session. API keys
  remain Better Auth HTTP credentials keyed by `referenceId` (User by default).

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
- **Close / Restore / Purge** — `closeUser` (self, typed email), `closeOrganization`
  (Owner, typed name), Admin-only `adminCloseUser`, `adminCloseOrganization`,
  `restoreUser`, `restoreOrganization`, `purgeUser`, `purgeOrganization`.

Better Auth's own HTTP endpoints stay under `/api/auth/*`. Better Auth
`deleteUser` is disabled; there is no `/api/auth/delete-user` product path and
Close does not send an account-deletion email.

### Close, Restore, and Purge

Decision record: ADR-0031 (`docs/adr/0031-close-restore-purge.md`).

**Closed** is a restorable lockout, not Membership soft-delete and not Better
Auth Ban. A Closed User cannot sign in. A Closed Organization cannot be used
and is hidden from product UI. Slug and email stay taken until Purge.

Who may act:

- Close User: the User (Danger zone, type email) or an AdminActor (Admin panel,
  no typed confirm).
- Close Organization: Owner (Danger zone, type org name) or an AdminActor.
  Organization Role admin cannot Close.
- Restore: AdminActor only, and only while the row is still Closed. There is no
  self-serve Restore.
- Purge now: AdminActor. A User who still Owns an Organization cannot be
  Purged.

Close User also Closes Organizations they Own when they are the only live
Member; otherwise they must Close or transfer those Organizations first. Close
User refuses if they are the last User-role admin. Close Organization refuses
while a child Organization is live and cancels Stripe at Close (it does not
resurrect on Restore).

Owner Membership stays until the Organization is Purged, even if that Owner
User is Closed. Other seats and pending invites leave on Organization Close.
User Close leaves non-Owner seats. Restore does not revive left Memberships.
Closed Organizations still count for currency until Purge.

When Workflow is registered, Auth runs one daily File-shaped sweep that Purges
Closed rows older than `closeAfterDays`: child Organizations before parents,
Organizations before Users; skip a User who still Owns an Organization. Apps
hook extra cleanup on the same Purge path Admin Purge uses. Without Workflow
there is no cron and Close does not Purge in-request; Closed rows stay until
Restore or Admin Purge.

Ban stays Better Auth `banUser` / `unbanUser` on the Admin user list. It is not
Close: a banned User is not Restored through Close, and Close does not set
`banned`.

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
`Providers.tsx` alongside `AppConfigProvider`). `useAuthLocale` persists
locale then refreshes the session with cookie cache disabled;
`AuthProvider` remounts children when the language changes.

## Web UI

`@m5kdev/web-ui` ships route-level routers you mount in your app router:

- `AuthPublicRouter` — login, signup, forgot/reset password, waitlist card and
  code validation, OAuth provider buttons, account claim,
  `/consent` (MCP allowlist picker during Better Auth MCP OAuth), and
  `/organization/accept-invitation` (must stay public so a logged-out invitee
  can be sent to signup instead of bouncing inside protected routes).
- `AuthUserRouter` — profile editor, preferences (Danger zone Close User),
  logout, invite friends.
- `AuthOrganizationRouter` — org profile, preferences (Owner Danger zone Close
  Organization), members, child organizations, org select.
- `AuthAdminRouter` — user management (change User Role, mark Email verified,
  set password, Close / Restore / Purge distinct from Ban), organization
  management (Close / Restore / Purge), waitlist. Role change is blocked
  for the signed-in User and for the last Active User-role admin. Optional
  `extraLinks` / `extraRoutes` hang Module admin (for example Billing) off
  sidecar links beside those tabs. Omit them for none.
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
  `memberId`. User Close of a non-Owner seat and Organization Close of
  non-Owner seats do the same; the Owner seat stays until Organization Purge.
  Restore does not revive left Memberships.
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
- [Better Auth 1.7.2 in 0.37.0](/guides/v0.37.0-better-auth-1.7.2-migration)
- [McpModule and MCP OAuth in 0.37.0](/guides/v0.37.0-mcp-oauth-migration)
- [Member ownership migration](/guides/v0.32.0-memberid-ownership-migration)
- [Membership at invite in 0.36.0](/guides/v0.36.0-membership-at-invite-migration)
- [Account claim and Waitlist in 0.36.0](/guides/v0.36.0-account-claim-waitlist-migration)
- [Team drop and unused User payment columns in 0.36.0](/guides/v0.36.0-team-drop-migration)
- [Email preview gate in 0.36.0](/guides/v0.36.0-email-preview-gate-migration)
- [User and organization locale migration](/guides/user-org-locale-migration)
- [Admin create verified user migration](/guides/admin-create-verified-user-migration)
- [Custom app roles migration](/guides/custom-app-roles-migration)
- [Kernel Server events in 0.35.0](/guides/v0.35.0-kernel-server-events-migration)
