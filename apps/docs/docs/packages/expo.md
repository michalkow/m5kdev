---
sidebar_position: 9
---

# Expo package

`@m5kdev/expo` is Expo-only adapters. The Starter Expo app may import it.
Frontend stays platform-agnostic; Web UI stays browser-only. Do not put Expo
APIs in `@m5kdev/frontend` or `@m5kdev/web-ui`.

## Use it for

- Native push permission + Device token + `notification.registerDevice`
  (`useNativePush`).
- A Membership inbox list that reuses Frontend `useNotificationInbox` without
  HeroUI.

## Module docs

Notification ownership, Channels, and tRPC:
[Notification](/modules/notification).

## Import map

```ts
import { useNativePush } from "@m5kdev/expo/hooks/useNativePush";
import { NotificationInbox } from "@m5kdev/expo/modules/notification/components/NotificationInbox";
```

Pass tRPC mutation options from the app (`trpc.notification.registerDevice`).
`useNativePush` is a no-op on web (`Platform.OS` not `ios`/`android`).

Peer dependencies: `expo`, `expo-notifications`, `react`, `react-native`.
