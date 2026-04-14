import { Button } from "@heroui/react";
import { useSidebar } from "@m5kdev/web-ui/components/ui/sidebar";
import { cn } from "@m5kdev/web-ui/utils";
import { ChevronsLeftIcon, ChevronsRightIcon } from "lucide-react";
import { Link } from "react-router";

export function AppSidebarHeader({
  logo,
  title,
  size = 30,
}: {
  logo: { src: string; alt: string };
  title: string;
  size?: number;
}) {
  const { open, toggleSidebar } = useSidebar();
  return (
    <div
      className={cn(
        "flex  justify-between items-center overflow-hidden gap-2",
        open ? "w-[239px] px-2 flex-row" : "w-auto flex-col"
      )}
    >
      <Link
        to="/"
        className={cn(
          "flex items-center font-medium overflow-hidden gap-2",
          open ? "w-[239px] px-2" : "w-auto"
        )}
        style={{ height: size }}
      >
        <img
          className="shrink-0"
          src={logo.src}
          alt={logo.alt}
          style={{ width: size, height: size }}
        />
        <span className="group-data-[collapsible=icon]:hidden font-semibold text-lg text-neutral-900">
          {title}
        </span>
      </Link>
      <Button
        isIconOnly
        variant="secondary"
        size="sm"
        className="w-4 h-6"
        onPress={() => toggleSidebar()}
      >
        {open ? (
          <ChevronsLeftIcon className="w-4 h-4" />
        ) : (
          <ChevronsRightIcon className="w-4 h-4" />
        )}
      </Button>
    </div>
  );
}
