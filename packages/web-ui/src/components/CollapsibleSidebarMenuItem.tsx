"use client";

import { Disclosure, type DisclosureProps } from "@heroui/react";
import { ChevronRight } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Link } from "react-router";
import { SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, useSidebar } from "./Sidebar";

interface CollapsibleSidebarMenuItemOwnProps {
  children: ReactNode;
  label: string;
  icon: ReactNode;
  link: string;
  badge?: ReactNode;
}

export function CollapsibleSidebarMenuItem({
  children,
  label,
  icon,
  link,
  badge,
  className,
  ...disclosureProps
}: CollapsibleSidebarMenuItemOwnProps & DisclosureProps): ReactElement {
  const { open } = useSidebar();

  if (!open) {
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
  }

  return (
    <SidebarMenuItem>
      <Disclosure className={className} {...disclosureProps}>
        <Disclosure.Heading className="w-full min-w-0">
          <SidebarMenuButton slot="trigger">
            {icon}
            {badge ?? <span>{label}</span>}
            <Disclosure.Indicator className="ml-auto shrink-0">
              <ChevronRight className="size-4 transition-transform duration-200 data-[expanded=true]:rotate-90" />
            </Disclosure.Indicator>
          </SidebarMenuButton>
        </Disclosure.Heading>
        <Disclosure.Content>
          <SidebarMenuSub>{children}</SidebarMenuSub>
        </Disclosure.Content>
      </Disclosure>
    </SidebarMenuItem>
  );
}
