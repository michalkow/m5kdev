import { EmptyState, Spinner } from "@heroui/react";
import type { NotificationInboxItem } from "@m5kdev/frontend/modules/notification/hooks/useNotificationTrpc";
import { DateTime } from "luxon";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export interface NotificationInboxRowRenderProps {
  readonly row: NotificationInboxItem;
  readonly markRead: (id: string) => void;
  readonly isMarkingRead: boolean;
}

export interface NotificationInboxPanelProps {
  readonly notifications: readonly NotificationInboxItem[];
  readonly isLoading: boolean;
  readonly markRead: (id: string) => void;
  readonly isMarkingRead: boolean;
  readonly renderRow?: (props: NotificationInboxRowRenderProps) => ReactNode;
  readonly enablePush?: ReactNode;
}

function formatCreatedAt(value: Date | string): string {
  const dt = value instanceof Date ? DateTime.fromJSDate(value) : DateTime.fromISO(String(value));
  return dt.toRelative() ?? dt.toLocaleString(DateTime.DATETIME_SHORT);
}

function DefaultNotificationInboxRow({
  row,
  markRead,
  isMarkingRead,
}: NotificationInboxRowRenderProps): ReactNode {
  const { t } = useTranslation("web-ui");
  const unread = row.readAt == null;

  return (
    <button
      type="button"
      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-default-100"
      disabled={!unread || isMarkingRead}
      onClick={() => {
        if (unread) markRead(row.id);
      }}
    >
      <span className={unread ? "font-medium" : "text-default-600"}>{row.title}</span>
      <span className="line-clamp-2 text-default-500">{row.body}</span>
      <span className="text-xs text-default-400">
        {formatCreatedAt(row.createdAt)}
        {unread ? ` · ${t("notification.inbox.markRead")}` : ""}
      </span>
    </button>
  );
}

export function NotificationInboxPanel({
  notifications,
  isLoading,
  markRead,
  isMarkingRead,
  renderRow,
  enablePush,
}: NotificationInboxPanelProps): ReactNode {
  const { t } = useTranslation("web-ui");

  return (
    <>
      <div className="border-b border-border px-3 py-2 text-sm font-medium">
        {t("notification.inbox.title")}
      </div>
      {enablePush ? <div className="border-b border-border p-2">{enablePush}</div> : null}
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
          {notifications.map((row) => (
            <li
              key={row.id}
              className={renderRow ? undefined : "border-b border-border last:border-b-0"}
            >
              {renderRow?.({ row, markRead, isMarkingRead }) ?? (
                <DefaultNotificationInboxRow
                  row={row}
                  markRead={markRead}
                  isMarkingRead={isMarkingRead}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
