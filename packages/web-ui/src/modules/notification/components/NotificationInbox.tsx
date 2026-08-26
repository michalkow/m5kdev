import { Button, EmptyState, Popover, Spinner } from "@heroui/react";
import { useNotificationInbox } from "@m5kdev/frontend/modules/notification/hooks/useNotificationInbox";
import { BellIcon } from "lucide-react";
import { DateTime } from "luxon";
import { useTranslation } from "react-i18next";

function formatCreatedAt(value: Date | string): string {
  const dt = value instanceof Date ? DateTime.fromJSDate(value) : DateTime.fromISO(String(value));
  return dt.toRelative() ?? dt.toLocaleString(DateTime.DATETIME_SHORT);
}

export function NotificationInbox() {
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
          aria-label={t("notification.inbox.title")}
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
          <div className="border-b border-border px-3 py-2 text-sm font-medium">
            {t("notification.inbox.title")}
          </div>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : notifications.length === 0 ? (
            <EmptyState className="px-3 py-8 text-center">
              <span className="text-sm text-default-500">{t("notification.inbox.empty")}</span>
            </EmptyState>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {notifications.map((row) => {
                const unread = row.readAt == null;
                return (
                  <li key={row.id} className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-default-100"
                      disabled={!unread || isMarkingRead}
                      onClick={() => {
                        if (unread) markRead(row.id);
                      }}
                    >
                      <span className={unread ? "font-medium" : "text-default-600"}>
                        {row.title}
                      </span>
                      <span className="line-clamp-2 text-default-500">{row.body}</span>
                      <span className="text-xs text-default-400">
                        {formatCreatedAt(row.createdAt)}
                        {unread ? ` · ${t("notification.inbox.markRead")}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
