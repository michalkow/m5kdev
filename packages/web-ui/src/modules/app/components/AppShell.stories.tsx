import type { Meta, StoryObj } from "@storybook/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router";

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
    <div className="flex flex-col gap-1 px-2 py-2 text-sm text-zinc-600 dark:text-zinc-400">
      <span>Home</span>
      <span>Settings</span>
    </div>
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
