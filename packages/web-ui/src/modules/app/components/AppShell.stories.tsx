import type { Meta, StoryObj } from "@storybook/react";
import { Home, Settings, Users } from "lucide-react";
import type { ReactElement } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router";

import { CollapsibleSidebarMenuItem } from "../../../components/CollapsibleSidebarMenuItem";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../../../components/Sidebar";
import { AppShell, type AppShellProps } from "./AppShell";
import { AppSidebarInvites } from "./AppSidebarInvites";
import { AppSidebarUser } from "./AppSidebarUser";

function OutletDemo(): ReactElement {
  return (
    <div>
      <h1 className="text-xl font-semibold">Main area</h1>
      <p className="mt-2 text-sm text-muted-ink">
        This content is rendered through the layout route&apos;s &lt;Outlet /&gt;.
      </p>
    </div>
  );
}

function AppShellStory(props: AppShellProps): ReactElement {
  return (
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route element={<AppShell {...props} />}>
          <Route path="/" element={<OutletDemo />} />
          <Route path="/team/*" element={<OutletDemo />} />
          <Route path="/settings" element={<OutletDemo />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

const meta = {
  title: "modules/app/AppShell",
  component: AppShellStory,
  tags: ["autodocs"],
} satisfies Meta<typeof AppShellStory>;

export default meta;
type Story = StoryObj<typeof meta>;

const sidebar: AppShellProps["sidebar"] = {
  header: (
    <div className="border-b border-zinc-200 px-2 py-3 text-sm font-semibold text-zinc-900 dark:border-zinc-700 dark:text-zinc-100">
      Navigation
    </div>
  ),
  content: (
    <SidebarGroup>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild>
            <Link to="/">
              <Home className="size-4" />
              <span>Home</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <CollapsibleSidebarMenuItem
          defaultExpanded
          icon={<Users className="size-4" />}
          label="Team"
          link="/team"
        >
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/team/members">
                <span>Members</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/team/settings">
                <span>Team settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </CollapsibleSidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton asChild>
            <Link to="/settings">
              <Settings className="size-4" />
              <span>Settings</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  ),
  footer: (
    <>
      <AppSidebarInvites count={3} />
      <AppSidebarUser
        user={{
          name: "Alex Morgan",
          email: "alex@example.com",
          image: null,
          role: "admin",
        }}
        organizationSettingsPath="/organization/settings"
        onSignOut={() => undefined}
      />
    </>
  ),
};

export const Default: Story = {
  args: {
    sidebar,
  },
};

export const WithTopHeader: Story = {
  args: {
    header: (
      <header className="flex h-12 items-center border-b border-zinc-200 bg-white px-4 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900">
        Top header
      </header>
    ),
    sidebar,
  },
};
