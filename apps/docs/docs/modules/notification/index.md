---
sidebar_position: 8
---

# Notification module

The Notification module is a Core Module. It persists an inbox instance per
Member, delivers optional outbound Channels (web push, mobile push, email), and
records every outbound attempt. Devices stay personal (UserId). Inbox and
preferences are org-scoped (MemberId).

Use it when the product needs in-app Notifications for the active Organization,
optional delayed push/email, and per-Membership mutes. Do not use it as a
generic event bus — that is [Server events](/modules/server-events). Do not use
it as EmailModule — Notification may call EmailModule for the email Channel.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | Channels, kinds, platforms, Zod schemas for devices, inbox instances, preferences, and send logs. |
| `@m5kdev/backend` | `NotificationModule`: tables, repository, service, jobs, tRPC. |
| `@m5kdev/frontend` | `useNotificationInbox`, `useNotificationPreferences`, inbox query keys and Server event invalidation. |
| `@m5kdev/web-ui` | Inbox popover/sidebar bar, preferences UI, `useWebPush`. |
| `@m5kdev/expo` | `useNativePush` and a React Native inbox list. |

`AppShell` does not import Notification. The app mounts inbox chrome in sidebar
`content` (or an equivalent slot).

## Shared contract

Kinds live in the app Shared package, not in a database table:

```ts
import type { NotificationKind } from "@m5kdev/commons/modules/notification/notification.constants";

export const NOTIFICATION_KINDS = [
  {
    id: "notification.test",
    defaultChannels: ["in-app"],
  },
] as const satisfies readonly NotificationKind[];
```

| Field | Meaning |
| --- | --- |
| `id` | Stable kind string. Preferences and `send({ kind })` use this. |
| `defaultChannels` | Offered Channels. Missing preference means on. |
| `delays` | Optional `webPushMs` / `mobilePushMs` / `emailMs`. Defaults: 2 min / 5 min / 15 min. |
| `emailTemplate` | EmailModule template key. Required for the email Channel to succeed. |

Channels: `in-app`, `web-push`, `mobile-push`, `email`. In-app is inbox
visibility at send time, not whether the instance exists. Server event is not a
Channel.

Starter re-exports commons from
`apps/shared/src/modules/notification/notification.schema.ts` and declares kinds
in `notification.constants.ts`.

## Backend

### Registration

```ts
import { createBackendApp } from "@m5kdev/backend/app";
import { NotificationModule } from "@m5kdev/backend/modules/notification/notification.module";
import { WorkflowModule } from "@m5kdev/backend/modules/workflow/workflow.module";
import { NOTIFICATION_KINDS } from "@starter-app/shared/modules/notification/notification.constants";

createBackendApp(config, [
  new WorkflowModule({ /* queues */ }),
  new NotificationModule({ kinds: NOTIFICATION_KINDS }),
]);
```

`dependsOn`: `auth`, `workflow`. `optionalDependsOn`: `email` (needed only for
the email Channel). Pass `kinds` into the module; the service rejects unknown
kind ids.

Feature flag: CLI `notifications` (experimental). Starter gates table exports,
`NotificationModule`, web Router, sidebar inbox chrome, prefs nav, Shared
kinds, and Expo `/notifications` with `// m5k:notifications:` markers. Keep
lucide `BellIcon` (and Notification imports) inside those markers so a stripped
`--yes` tree does not leave unused imports. CLI `paths` for this id stay empty.

### Tables

Export these from App schema when the feature is on:

| Table | Key | Role |
| --- | --- | --- |
| `notification_devices` | UserId | Push endpoint (web subscription or native token). |
| `notifications` | MemberId (+ UserId for delivery) | Inbox instance. Always inserted on `send`. |
| `notification_preferences` | MemberId + kind + channel | Mute rows only (presence = off). |
| `notification_send_logs` | UserId; optional Device | One outbound attempt per Device or email send. |

Inbox list is that Membership (active Organization), not a merge across
Organizations. Devices stay on UserId so one browser/phone serves every
Membership.

### Send orchestration

Call `NotificationService.send` from the service that owns the use case. There
is no product tRPC for send (only admin `sendTest`).

```ts
await this.service.notification.send({
  memberId,
  kind: "notification.test",
  title: "Welcome",
  body: "Your membership is ready.",
  data: { path: "/" },
  // channels: optional subset of the kind's defaultChannels
});
```

1. Resolve the kind. Unknown id → `BAD_REQUEST`.
2. Load the active Membership. Missing/soft-deleted → `NOT_FOUND`.
3. Arm Channels: kind defaults ∩ requested ∩ not muted.
4. Insert the instance. `visibleInInbox` is whether `in-app` is armed. Later
   preference changes do not hide or reveal existing rows.
5. `userEmit` `{ resource: "notification", id, change: "created", organizationId }`.
6. Enqueue delayed jobs for armed outbound Channels (`notification.webPush`,
   `notification.mobilePush`, `notification.email`). Job payload is
   `{ notificationId }`.

Outbound jobs no-op if the Member already marked the instance read, if the
Channel was not armed, or if that Channel already has a send log / stamp.
First successful web push, mobile push, and email stamp `webPushedAt` /
`mobilePushedAt` / `emailedAt`. Permanent token failures disable the Device.

Do not wrap `send` in a pass-through on another service.

### tRPC procedures

| Procedure | Auth | Description |
| --- | --- | --- |
| `notification.vapidPublicKey` | Public | VAPID public key for browser subscribe |
| `notification.registerDevice` | Required (User) | Upsert this User's Device |
| `notification.unregisterDevice` | Required (User) | Remove a Device this User owns |
| `notification.listMyDevices` | Required (User) | This User's Devices (web endpoints masked) |
| `notification.listMyInbox` | Organization | Visible inbox for the active Membership |
| `notification.markRead` | Organization | Mark one instance read |
| `notification.getMyPreferences` | Organization | Offered Channels per kind (missing mute = on) |
| `notification.setMyPreference` | Organization | Mute (`enabled: false`) or clear mute |
| `notification.listMySendLogs` | Required (User) | This User's outbound attempts |
| `notification.sendTest` | Admin | `send` as admin (`memberId` + kind + title + body) |

Grants: Device procedures use user-scope `"own"` on UserId. Inbox and
preferences use organization-scope `"own"` on MemberId
(`defaultNotificationGrants`).

### Providers and environment

| Channel / provider | Configuration |
| --- | --- |
| Web push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Client script default `/push-sw.js`. |
| APNs | `APNS_KEY_PATH`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, optional `APNS_PRODUCTION=true` |
| FCM | `FIREBASE_SERVICE_ACCOUNT_PATH` or `GOOGLE_APPLICATION_CREDENTIALS` |
| Email | Register `EmailModule`; set `emailTemplate` on the kind |

Delivery jobs need Redis (same as Workflow). A single in-process server without
Redis will not run delayed push/email.

## Frontend

Hooks live in `@m5kdev/frontend`. There is no `NotificationProvider`.

```ts
import { useNotificationInbox } from "@m5kdev/frontend/modules/notification/hooks/useNotificationInbox";
import { useNotificationPreferences } from "@m5kdev/frontend/modules/notification/hooks/useNotificationPreferences";
```

`useNotificationInbox` lists `listMyInbox` keyed by `activeOrganizationId`,
marks read, and registers `useServerEventHandler` for
`resource: "notification"` (org-tagged; ignored when the active Organization
does not match). Compose `ServerEventProvider` as in
[Server events](/modules/server-events) — the inbox hook does not replace that
provider.

`useNotificationPreferences` lists and sets mutes for the active Membership.

## Web UI

| Component | Use |
| --- | --- |
| `NotificationSidebarInbox` | Sidebar chip/bar (bell only when collapsed). Optional `enablePush` slot and `renderRow`. |
| `NotificationInbox` | Icon-button popover (header). Same `enablePush` / `renderRow`. |
| `NotificationInboxPanel` | Shared list body. |
| `NotificationPreferences` | Per-kind Channel switches. Pass `kinds` and `offerEmail`. |

Web push subscribe: `useWebPush` from `@m5kdev/web-ui/hooks/useWebPush`. Pass
`vapidPublicKey.queryOptions()` and `registerDevice.mutationOptions()`. Starter
hides the CTA after `flowStatus === "done"` (`StarterWebPush`).

## Expo

```ts
import { useNativePush } from "@m5kdev/expo/hooks/useNativePush";
import { NotificationInbox } from "@m5kdev/expo/modules/notification/components/NotificationInbox";
```

`useNativePush` registers an iOS/Android Device (UserId). The inbox list uses
the same frontend hook as web. Expo has no Server event provider in this
release — navigate away and back, or refetch, to pick up new rows. Package
ownership: [`@m5kdev/expo`](/packages/expo).

## App-level flow

1. Declare kinds in Shared. Register `NotificationModule({ kinds })` and export
   the four tables from App schema. Generate Drizzle migrations locally.
2. Web: mount `NotificationSidebarInbox` in sidebar content (not in `AppShell`).
   Pass `enablePush` only when this browser is not registered. Add
   `/notifications` with `NotificationPreferences`.
3. Expo: a notifications screen with native push CTA + inbox list.
4. From domain services, `send({ memberId, kind, title, body })`.
5. Worker + Redis for delayed outbound Channels. VAPID (and APNs/FCM) only if
   those Channels are offered.

Upgrade from device-only Notification:
[Notification inbox in 0.36.0](/guides/v0.36.0-notification-inbox-migration).

## Related docs

- [Server events](/modules/server-events)
- [Email](/modules/email)
- [Workflow](/modules/workflow)
- [App shell](/modules/app)
- [Organizations and members](/guides/organizations-and-members)
- [Notification inbox in 0.36.0](/guides/v0.36.0-notification-inbox-migration)
- [Email preview gate in 0.36.0](/guides/v0.36.0-email-preview-gate-migration)
- [Expo package](/packages/expo)
