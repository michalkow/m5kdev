import type { ReactNode } from "react";
import { Link } from "react-router";
import { SidebarMenuButton, SidebarMenuItem } from "#components/ui/sidebar";

export function SidebarItem({
  label,
  icon,
  link,
  badge,
}: {
  label: string;
  icon: ReactNode;
  link: string;
  badge?: ReactNode;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={label}>
        <Link to={link}>
          {icon}
          {badge ? badge : <span>{label}</span>}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
