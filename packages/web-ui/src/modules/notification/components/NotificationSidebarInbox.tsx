import { Chip, Popover, Tooltip } from "@heroui/react";
import { useNotificationInbox } from "@m5kdev/frontend/modules/notification/hooks/useNotificationInbox";
import { BellIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSidebar } from "../../../components/Sidebar";
import { cn } from "../../../lib/utils";
import {
  NotificationInboxPanel,
  type NotificationInboxRowRenderProps,
} from "./NotificationInboxPanel";

export interface NotificationSidebarInboxProps {
  readonly renderRow?: (props: NotificationInboxRowRenderProps) => ReactNode;
  readonly enablePush?: ReactNode;
}

function unreadLabel(count: number): string {
  return count > 9 ? "9+" : String(count);
}

export function NotificationSidebarInbox({
  renderRow,
  enablePush,
}: NotificationSidebarInboxProps = {}): ReactNode {
  const { open } = useSidebar();
  const { t } = useTranslation("web-ui");
  const { notifications, isLoading, markRead, isMarkingRead } = useNotificationInbox();
  const unreadCount = notifications.filter((row) => row.readAt == null).length;
  const title = t("notification.inbox.title");
  const ariaLabel =
    unreadCount > 0 ? t("notification.inbox.triggerAriaUnread", { count: unreadCount }) : title;

  const trigger = (
    <Popover.Trigger>
      <button
        type="button"
        aria-label={ariaLabel}
        className={cn(
          "relative flex items-center gap-2 rounded-xl border border-border bg-default-100 text-left text-sm text-surface-foreground transition-colors",
          "hover:bg-default-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-default-400",
          open ? "h-10 w-full px-3" : "size-8 justify-center p-0"
        )}
      >
        <BellIcon className="size-4 shrink-0 text-default-600" />
        {open ? (
          <>
            <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
            {unreadCount > 0 ? (
              <Chip color="danger" size="sm" variant="soft">
                {unreadLabel(unreadCount)}
              </Chip>
            ) : null}
          </>
        ) : unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium text-danger-foreground">
            {unreadLabel(unreadCount)}
          </span>
        ) : null}
      </button>
    </Popover.Trigger>
  );

  return (
    <div className={cn("px-2", open ? "w-full" : "flex justify-center px-0")}>
      <Popover>
        {open ? (
          trigger
        ) : (
          <Tooltip>
            <Tooltip.Trigger>{trigger}</Tooltip.Trigger>
            <Tooltip.Content placement="right">{title}</Tooltip.Content>
          </Tooltip>
        )}
        <Popover.Content placement={open ? "bottom start" : "right"} className="w-80">
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
    </div>
  );
}
