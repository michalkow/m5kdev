---
sidebar_position: 8
---

# Notification module

The notification module delivers push notifications to registered devices over
Web Push (VAPID), APNs, and FCM, with device registration and per-send logging.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/commons` | Notification constants and schemas. |
| `@m5kdev/backend` | `NotificationModule`: `notification_devices` and `notification_send_logs` tables, providers, service, tRPC procedures. |

## Registration

```ts
import { NotificationModule } from "@m5kdev/backend/modules/notification/notification.module";

backendApp.use(new NotificationModule({ namespace: "notification" }));
```

Depends on `auth` and `workflow` — delivery runs as a queued job
(`deliverNotificationJob`), so the workflow module must be registered.

## Delivery flow

1. The client registers a device (`registerDevice`) with its push subscription
   or token; devices are stored per user in `notification_devices`.
2. App code calls `enqueueSendToUser({ userId, ... })`, which fans out a
   delivery job per device via the workflow queue.
3. Providers send through Web Push, APNs, or FCM; results are recorded in
   `notification_send_logs`.
4. Permanent token failures (`webPushErrorShouldDisableDevice`,
   `providerForPermanentTokenFailure`) disable dead devices automatically.

## Providers and environment

| Provider | Configuration |
| --- | --- |
| Web Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| APNs | APN credentials (see `notification.providers.ts`) |
| FCM | `FIREBASE_SERVICE_ACCOUNT_PATH` / `GOOGLE_APPLICATION_CREDENTIALS` |

## tRPC procedures

| Procedure | Auth | Description |
| --- | --- | --- |
| `notification.vapidPublicKey` | Public | VAPID public key for browser subscription |
| `notification.registerDevice` | Required | Register the current device |
| `notification.unregisterDevice` | Required | Remove a device |
| `notification.listMyDevices` | Required | List the current user's devices |
| `notification.listMySendLogs` | Required | List the current user's send logs |
| `notification.sendTest` | Admin | Send a test notification |
