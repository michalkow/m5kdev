import { Button } from "@heroui/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SupportPanel } from "./SupportPanel";

export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation("web-ui");
  return (
    <aside className="fixed bottom-4 end-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2">
      {open && (
        <div className="max-h-[80dvh] w-96 overflow-y-auto rounded-2xl border border-border bg-surface shadow-xl">
          <SupportPanel />
        </div>
      )}
      <Button aria-expanded={open} variant="primary" onPress={() => setOpen(!open)}>
        {t(open ? "support.close" : "support.title")}
      </Button>
    </aside>
  );
}
