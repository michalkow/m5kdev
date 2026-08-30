---
sidebar_position: 8
---

# Notification module

`NotificationModule` is a Core Module. It persists an inbox instance per send,
honors per-Membership Channel mutes, and delivers unread outbound Channels on
a delay (web push, mobile push, email). Devices stay personal (UserId). Inbox
rows and preferences are Membership-owned (MemberId).

The CLI `notifications` feature is **experimental**.

It is not a Server event bus, not EmailModule, and not browser/OS permission.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | Platforms, Channels, kinds shape, Zod contracts. |
| `@m5kdev/backend` | `NotificationModule`: devices, inbox, preferences, send logs, providers, jobs, tRPC. |
| `@m5kdev/frontend` | Inbox and preference hooks scoped to the active Organization. |
| `@m5kdev/web-ui` | Browser inbox chrome, preferences switches, `useWebPush`. |
| `@m5kdev/expo` | Native Device registration (`useNativePush`) and a Membership inbox list. |
| App shared | Kind catalog registered on the module (Starter: `NOTIFICATION_KINDS`). |

## Registration

Depends on `auth` and `workflow`. Email Channel delivery optionally uses
`EmailModule` (`optionalDependsOn: ["email"]`). Delivery jobs run on BullMQ, so
Redis (`REDIS_URL`) must be up before the server starts.

```ts
import { createBackendApp } from "@m5kdev/backend/app";
import { NotificationModule } from "@m5kdev/backend/modules/notification/notification.module";
import type { NotificationKind } from "@m5kdev/commons/modules/notification/notification.constants";

const kinds = [
  {
    id: "notification.test",
    defaultChannels: ["in-app"],
  },
] as const satisfies readonly NotificationKind[];

createBackendApp(config, [
  new NotificationModule({
    kinds,
    // config: { notificationQueue, deliveryTimeout },
  }),
]);
```

Unknown `kind` ids fail `send` with `BAD_REQUEST` and do not insert or emit.
Starter registers `NOTIFICATION_KINDS` from
`apps/starter/shared/src/modules/notification/notification.constants.ts`
(in-app only).

## Ownership

| Resource | Key | Notes |
| --- | --- | --- |
| Device | UserId | Web / iOS / Android push endpoint. Same Device is used for every Organization. |
| Notification instance | MemberId | Inbox row. `userId` is dual-written for Device lookup and email. |
| Notification preference | MemberId | Mute for one kind × Channel. Distinct per Membership. |
| Send log | UserId (+ `notificationId`) | One outbound attempt per Device or email send. Not in-app. |

Default Grants: user-level `own` on Devices; organization-level `own` on inbox
and preferences. There is no org-wide `read`/`write` on another Member's inbox.

## Kinds and Channels

Declare kinds in the app Shared contract and pass them into `NotificationModule`.
Each kind lists `defaultChannels` (the offered set). Optional:

- `delays.webPushMs` / `mobilePushMs` / `emailMs` — override cascade delay
- `emailTemplate` — EmailModule template key for the email Channel

| Channel | Default delay | Delivery |
| --- | --- | --- |
| `in-app` | none | `visibleInInbox` at insert. Not a send log. |
| `web-push` | 2 minutes | Web Push (VAPID) to `platform: "web"` Devices. |
| `mobile-push` | 5 minutes | APNs (`ios`) and FCM (`android`). |
| `email` | 15 minutes | EmailModule `sendTemplate` once, if registered and the kind has `emailTemplate`. |

Constants: `NOTIFICATION_DEFAULT_*_DELAY_MS` in
`@m5kdev/commons/modules/notification/notification.constants`.

## Send flow

App code calls `NotificationService.send` (admin tRPC `sendTest` wraps the same
path). There is no `enqueueSendToUser`.

1. Resolve the kind. Load the active Membership for `memberId` (soft-deleted →
   `NOT_FOUND`).
2. Load that Member's muted preferences. **Preference wins** over Channels named
   in `send`. Armed = `(input.channels ?? kind.defaultChannels)` ∩ offered − muted.
3. **Always insert** an inbox row, even when `in-app` is muted.
   `visibleInInbox` is true only when `in-app` is armed. Later preference
   changes do not hide or reveal existing rows.
4. `userEmit` a Server event (`resource: "notification"`, `change: "created"`,
   `organizationId` from the Membership).
5. Enqueue delayed jobs for armed outbound Channels
   (`notification.webPush`, `notification.mobilePush`, `notification.email`).
   Job id is `web:` / `mobile:` / `email:` + notification id.

When a delayed job runs it **skips** if the instance is already read, the
Channel is not armed, or a send log already exists for that Channel. First
successful web/mobile/email stamp `webPushedAt` / `mobilePushedAt` /
`emailedAt`. Permanent token failures disable that Device
(`providerForPermanentTokenFailure`).

Muting `mobile-push` in Organization A does not skip Organization B's send to
the same User Device.

```ts
const sent = await services.notification.send({
  memberId,
  kind: "notification.test",
  title: "Hello",
  body: "Inbox row for this Membership",
  // channels: ["in-app", "web-push"], // optional subset of the kind's offered set
});
```

## Preferences

A preference row is a **mute**. Missing row means on. `setMyPreference` with
`enabled: true` deletes the mute; `enabled: false` inserts it. You can only
mute a Channel the kind offers.

`getMyPreferences` returns the kind catalog with `enabled` per offered Channel
for the active Membership.

## Jobs

Jobs are service fields on `NotificationService`, not a module `workflows()`
hook:

```ts
readonly webPushJob = this.service.workflow
  .job({ name: "notification.webPush", /* ... */ })
  .handle(async (payload) => { /* deliverWebPush */ });
```

The Kernel scans services with `registry.registerService`. Missing `.handle()`
throws at boot. See [Workflow](/modules/workflow).

## Providers and environment

Providers construct clients on first send. Missing keys fail that send, not
module boot (`vapidPublicKey` is the exception: it returns
`PRECONDITION_FAILED` without `VAPID_PUBLIC_KEY`).

| Provider | Environment |
| --- | --- |
| Web Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, optional `VAPID_SUBJECT` (default `mailto:noreply@localhost`) |
| APNs | `APNS_KEY_PATH`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, optional `APNS_PRODUCTION=true` |
| FCM | `FIREBASE_SERVICE_ACCOUNT_PATH` or `GOOGLE_APPLICATION_CREDENTIALS` (service-account JSON path) |

Starter lists these in `apps/starter/shared/.env.example`. Generate VAPID with
`npx web-push generate-vapid-keys`.

## tRPC procedures

| Procedure | Auth | Description |
| --- | --- | --- |
| `notification.vapidPublicKey` | Public | VAPID public key for `pushManager.subscribe` |
| `notification.registerDevice` | User | Upsert this User's Device. Rejects endpoint/token steal (`CONFLICT`) |
| `notification.unregisterDevice` | User | Delete a Device this User owns |
| `notification.listMyDevices` | User | List this User's Devices (web endpoints masked) |
| `notification.listMyInbox` | Organization | Visible inbox for the **active** Membership |
| `notification.getMyPreferences` | Organization | Kind catalog + mute state for the active Membership |
| `notification.setMyPreference` | Organization | Mute or unmute one kind × Channel |
| `notification.markRead` | Organization | Mark own visible instance read |
| `notification.listMySendLogs` | User | Outbound attempts for this User |
| `notification.sendTest` | Admin | `send` for a `memberId` + kind |

Inbox and preferences require an Organization Actor (`memberId` +
`organizationId`). Switching Organization switches the inbox; it is not a
merge across Memberships.

## Frontend (`@m5kdev/frontend`)

```ts
import {
  useNotificationInbox,
  useNotificationPreferences,
} from "@m5kdev/frontend";
```

- `useNotificationInbox` — `listMyInbox` keyed by `activeOrganizationId`.
  Subscribes to Server events (`resource: "notification"`) and invalidates only
  when `event.organizationId` matches the active Organization. `markRead`
  invalidates the same key.
- `useNotificationPreferences` — `getMyPreferences` / `setMyPreference`, same
  Organization key.

Mount `ServerEventProvider` in the app shell. Reconnect has no replay: the
inbox hook invalidates on matching events; keep
[Server events](/modules/server-events) `onReconnect` behavior in mind.

## Web UI (`@m5kdev/web-ui`)

| Import | Role |
| --- | --- |
| `.../NotificationInbox` | Header popover inbox |
| `.../NotificationSidebarInbox` | App shell sidebar inbox (Starter uses this) |
| `.../NotificationPreferences` | Kind × Channel switches. Pass `kinds` and `offerEmail` |
| `@m5kdev/web-ui/hooks/useWebPush` | Permission + SW + VAPID + `registerDevice` |

Pass tRPC options into `useWebPush` (Starter: `StarterWebPush`). Default service
worker URL is `/push-sw.js`.

`NotificationPreferences` hides the email Channel when `offerEmail` is false,
even if the kind lists it.

## Expo (`@m5kdev/expo`)

```ts
import { useNativePush } from "@m5kdev/expo/hooks/useNativePush";
import { NotificationInbox } from "@m5kdev/expo/modules/notification/components/NotificationInbox";
```

`useNativePush` requests permission, reads the native Device token, and calls
`registerDevice` with `platform: "ios" | "android"`. No-op on web. Inbox chrome
reuses the Frontend hook (Membership inbox, not Web UI).

## Starter wiring

When the `notifications` feature is selected:

- Server: `new NotificationModule({ kinds: NOTIFICATION_KINDS })` and tables in
  `schema.ts`.
- Webapp: sidebar inbox, `/notifications` preferences route, `StarterWebPush`.
- Expo: `/notifications` screen with native Device registration + inbox.

Inbox hooks talk to `trpc.notification.*`. If the module is not registered,
those calls fail.

## Pitfalls

- **Do not send by UserId.** Address `send` at `memberId`. The inbox is that
  Membership only.
- **Do not treat Device mute as org-wide.** Devices are User-owned; Channel
  mutes are Membership-owned.
- **In-app mute does not delete the row.** The instance is still inserted;
  `listMyInbox` hides it (`visibleInInbox: false`).
- **Read cancels outbound.** Marking read before the delay elapses skips web,
  mobile, and email jobs.
- **Email needs both EmailModule and `kind.emailTemplate`.** Otherwise the email
  job logs `failed` and leaves `emailedAt` unset.
- **Workflow + Redis are required.** Notification depends on Workflow even if
  you only use in-app.
- **VAPID is required for web subscribe/send**, not for in-app inbox.

## Related docs

- [Organizations and members](/guides/organizations-and-members)
- [Server events](/modules/server-events)
- [Workflow](/modules/workflow)
- [Email](/modules/email)
- [CLI package](/packages/cli)
- [Expo package](/packages/expo)
