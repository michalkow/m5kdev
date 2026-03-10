import { Badge, Button, Tooltip } from "@heroui/react";
import { useSidebar } from "@m5kdev/web-ui/components/ui/sidebar";
import { cn } from "@m5kdev/web-ui/utils";
import { GiftIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export function AppSidebarInvites({ count }: { count: number }) {
  const { open } = useSidebar();
  const { t } = useTranslation("web-ui");
  return (
    <div className={cn("flex justify-center w-auto")}>
      <Tooltip content={t("sidebar.invites.title")} placement="right" isDisabled={open}>
        <Badge color="primary" variant="faded" content={count} size="sm" isOneChar>
          <Button
            as={Link}
            to="/invites"
            className={cn("flex items-center gap-2")}
            isIconOnly={!open}
            size="sm"
            variant="light"
          >
            <GiftIcon className="w-4 h-4 text-neutral-500" />
            <span className="group-data-[collapsible=icon]:hidden text-sm text-neutral-500">
              {t("sidebar.invites.title")}
            </span>
          </Button>
        </Badge>
      </Tooltip>
    </div>
  );
}
