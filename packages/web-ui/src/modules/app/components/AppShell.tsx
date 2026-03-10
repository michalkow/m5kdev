import { SidebarInset, SidebarProvider } from "@m5kdev/web-ui/components/ui/sidebar";
import type { ReactNode } from "react";
import { Outlet } from "react-router";
import { AppSidebar, type AppSidebarProps } from "#modules/app/components/AppSidebar";

export type AppShellProps = {
  header?: ReactNode;
  sidebar: AppSidebarProps;
};

export function AppShell({ header, sidebar }: AppShellProps) {
  return (
    <SidebarProvider>
      {header}
      <AppSidebar {...sidebar} />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
