import type { NotificationKind } from "@m5kdev/commons/modules/notification/notification.constants";

export const NOTIFICATION_KINDS = [
  { id: "notification.test", defaultChannels: ["in-app"] },
] as const satisfies readonly NotificationKind[];
