import { Button, Popover } from "@heroui/react";
import { useSupport } from "@m5kdev/frontend/modules/support/hooks/useSupport";
import { useSupportWidget } from "@m5kdev/frontend/modules/support/hooks/useSupportWidget";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type SupportComposerDraft,
  SupportPanelView,
  snapshotSupportComposer,
} from "./SupportPanel";
export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const state = useSupport();
  const composerRef = useRef<HTMLFormElement | null>(null);
  const draftRef = useRef<SupportComposerDraft | null>(null);
  const changeOpen = (next: boolean) => {
    if (!next && composerRef.current)
      draftRef.current = snapshotSupportComposer(composerRef.current, state.selectedId);
    setOpen(next);
  };
  const { t } = useTranslation("web-ui");
  const { unreadCount } = useSupportWidget({ isOpen: open, onClose: () => changeOpen(false) });
  return (
    <aside className="fixed bottom-4 end-4 z-40">
      <Popover isOpen={open} onOpenChange={changeOpen}>
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
            className="max-h-[80dvh] overflow-y-auto p-0"
          >
            <div className="flex justify-end px-3 pt-2">
              <Button size="sm" variant="tertiary" onPress={() => changeOpen(false)}>
                {t("support.close")}
              </Button>
            </div>
            <SupportPanelView state={state} composerRef={composerRef} draftRef={draftRef} />
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </aside>
  );
}
