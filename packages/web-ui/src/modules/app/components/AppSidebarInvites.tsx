import { Badge, Tooltip } from "@heroui/react";
import { cn } from "@m5kdev/web-ui/utils";
import { GiftIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useSidebar } from "../../../components/Sidebar";

export function AppSidebarInvites({ count }: { count: number }) {
  const { open } = useSidebar();
  const { t } = useTranslation("web-ui");
  const badge = (
    <Badge color="accent" variant="soft" content={String(count)} size="sm">
      <Link
        to="/invites"
        className={cn(
          "inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium transition-colors",
          "text-default-600 hover:bg-default-100 hover:text-surface-foreground",
          open ? "w-full justify-start" : "size-8 justify-center p-0"
        )}
      >
        <GiftIcon className="w-4 h-4 shrink-0 text-default-500" />
        <span className="group-data-[collapsible=icon]:hidden text-sm text-default-500">
          {t("sidebar.invites.title")}
        </span>
      </Link>
    </Badge>
  );

  return (
    <div className={cn("flex justify-center w-auto")}>
      {open ? (
        badge
      ) : (
        <Tooltip>
          <Tooltip.Trigger>{badge}</Tooltip.Trigger>
          <Tooltip.Content placement="right">{t("sidebar.invites.title")}</Tooltip.Content>
        </Tooltip>
      )}
    </div>
  );
}
