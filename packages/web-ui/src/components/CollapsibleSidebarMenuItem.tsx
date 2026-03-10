import type { CollapsibleProps } from "@radix-ui/react-collapsible";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#components/ui/collapsible";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  useSidebar,
} from "#components/ui/sidebar";

export function CollapsibleSidebarMenuItem({
  children,
  label,
  icon,
  link,
  badge,
  ...props
}: {
  children: ReactNode;
  label: string;
  icon: ReactNode;
  link: string;
  badge?: ReactNode;
} & CollapsibleProps) {
  const { open } = useSidebar();

  if (!open)
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip={label}>
          <Link to={link}>
            {icon}
            <span>{label}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );

  return (
    <Collapsible asChild className="group/collapsible" {...props}>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton>
            {icon}
            {badge ? badge : <span>{label}</span>}
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>{children}</SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
