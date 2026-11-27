import { Button, Popover } from "@heroui/react";
import { useSupportWidget } from "@m5kdev/frontend/modules/support/hooks/useSupportWidget";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SupportPanel } from "./SupportPanel";
export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation("web-ui");
  const { unreadCount } = useSupportWidget();
  return (
    <aside className="fixed bottom-4 end-4 z-40">
      <Popover isOpen={open} onOpenChange={setOpen}>
        <Button
          variant="primary"
          aria-label={
            unreadCount ? t("support.unreadTrigger", { count: unreadCount }) : t("support.title")
          }
        >
          {t("support.title")}
          {unreadCount > 0 && (
            <span className="rounded-full bg-surface px-2 text-xs text-foreground">
              {unreadCount}
            </span>
          )}
        </Button>
        <Popover.Content placement="top end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
          <Popover.Dialog
            aria-label={t("support.title")}
            onKeyDownCapture={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setOpen(false);
              }
            }}
            className="max-h-[80dvh] overflow-y-auto p-0"
          >
            <div className="flex justify-end px-3 pt-2">
              <Button size="sm" variant="tertiary" onPress={() => setOpen(false)}>
                {t("support.close")}
              </Button>
            </div>
            <SupportPanel />
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </aside>
  );
}
