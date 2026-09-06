---
sidebar_position: 8
---

# Expo package

`@m5kdev/expo` is native React Native chrome for Expo apps. It is not a Backend
Module. Inbox data and Device registration still go through
`@m5kdev/frontend` hooks and Notification tRPC.

Use it when the product has an Expo app (`create-m5kdev --platform expo` or
`both`) and needs a native push CTA plus a Membership inbox list. Web UI for
the same feature lives in `@m5kdev/web-ui`.

## Exports

| Import | What it owns |
| --- | --- |
| `@m5kdev/expo/hooks/useNativePush` | Permission + device token + `notification.registerDevice` (UserId). |
| `@m5kdev/expo/modules/notification/components/NotificationInbox` | React Native inbox list (same `useNotificationInbox` as web). |

```ts
import { useNativePush } from "@m5kdev/expo/hooks/useNativePush";
import { NotificationInbox } from "@m5kdev/expo/modules/notification/components/NotificationInbox";
```

`useNativePush`:

- No-op on web (`isSupported` is false unless `Platform.OS` is `ios` or
  `android`).
- Requests `expo-notifications` permission, reads
  `getDevicePushTokenAsync()`, then calls the mutation you pass
  (`trpc.notification.registerDevice.mutationOptions()` in Starter).
- Pass `enabled: false` when signed out. Hide the CTA after
  `flowStatus === "done"`.

Expo has no `ServerEventProvider` in this release. Navigate away and back, or
refetch, to pick up new inbox rows. Native push delivery still needs Redis
plus APNs/FCM env on the server — see [Notification](/modules/notification).

CLI feature id `notifications` (experimental) keeps Expo `/notifications` when
the flag is on. `--yes` does not enable it.

## Package rule

Keep native Device registration and React Native inbox rendering here. Keep
tRPC/query hooks in `@m5kdev/frontend`. Do not import `@m5kdev/web-ui`
Notification components into Expo.

Peers: `expo`, `expo-notifications`, `react`, `react-native`.
