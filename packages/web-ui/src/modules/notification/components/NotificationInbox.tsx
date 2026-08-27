import { Button, Popover } from "@heroui/react";
import { useNotificationInbox } from "@m5kdev/frontend/modules/notification/hooks/useNotificationInbox";
import { BellIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  NotificationInboxPanel,
  type NotificationInboxRowRenderProps,
} from "./NotificationInboxPanel";

export type { NotificationInboxRowRenderProps };

export interface NotificationInboxProps {
  readonly renderRow?: (props: NotificationInboxRowRenderProps) => ReactNode;
  readonly enablePush?: ReactNode;
}

export function NotificationInbox({
  renderRow,
  enablePush,
}: NotificationInboxProps = {}): ReactNode {
  const { t } = useTranslation("web-ui");
  const { notifications, isLoading, markRead, isMarkingRead } = useNotificationInbox();
  const unreadCount = notifications.filter((row) => row.readAt == null).length;

  return (
    <Popover>
      <Popover.Trigger>
        <Button
          isIconOnly
          variant="ghost"
          className="relative"
          aria-label={
            unreadCount > 0
              ? t("notification.inbox.triggerAriaUnread", { count: unreadCount })
              : t("notification.inbox.title")
          }
        >
          <BellIcon className="size-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium text-danger-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </Popover.Trigger>
      <Popover.Content placement="bottom end" className="w-80">
        <Popover.Dialog className="p-0">
          <NotificationInboxPanel
            notifications={notifications}
            isLoading={isLoading}
            markRead={markRead}
            isMarkingRead={isMarkingRead}
            renderRow={renderRow}
            enablePush={enablePush}
          />
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
