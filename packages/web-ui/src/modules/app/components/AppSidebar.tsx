import type { ReactNode } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "#components/ui/sidebar";

export type AppSidebarProps = {
  header: ReactNode;
  content?: ReactNode;

  footer?: ReactNode;
};

export function AppSidebar({ header, content, footer }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>{header}</SidebarHeader>
      <SidebarContent>{content}</SidebarContent>
      <SidebarFooter>{footer}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
