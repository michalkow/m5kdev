import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import { AppTrpcQueryProvider } from "@m5kdev/frontend/modules/app/components/AppTrpcQueryProvider";
import type { Meta, StoryObj } from "@storybook/react";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { Toaster } from "sonner";
import { AuthAdminLayout } from "./AuthAdminLayout";
import { AuthAdminOrganizationManagement } from "./AuthAdminOrganizationManagement";
import { AuthAdminUserManagement } from "./AuthAdminUserManagement";
import { AuthAdminWaitlist } from "./AuthAdminWaitlist";

interface AuthAdminRouterStoryProps {
  readonly initialPath: string;
  readonly enableWaitlist: boolean;
  readonly enableAccountClaimActions: boolean;
  readonly enableAiUsage: boolean;
}

function AuthAdminRouterStory({
  initialPath,
  enableWaitlist,
  enableAccountClaimActions,
  enableAiUsage,
}: AuthAdminRouterStoryProps): ReactElement {
  return (
    <div className="bg-background text-foreground">
      <Toaster richColors />
      <AppConfigProvider
        config={{
          appUrl: "http://localhost:6006",
          serverUrl: "http://localhost:3000",
          appName: "Storybook",
        }}
      >
        <AppTrpcQueryProvider>
          <MemoryRouter initialEntries={[initialPath]}>
            <NuqsAdapter>
              <Routes>
                <Route element={<AuthAdminLayout enableWaitlist={enableWaitlist} />}>
                  {/* Same route tree as AuthAdminRouter in AuthRouter.tsx */}
                  <Route
                    path="/admin/users"
                    element={
                      <AuthAdminUserManagement
                        enableAccountClaimActions={enableAccountClaimActions}
                        enableAiUsage={enableAiUsage}
                      />
                    }
                  />
                  <Route path="/admin/organizations" element={<AuthAdminOrganizationManagement />} />
                  {enableWaitlist ? (
                    <Route path="/admin/waitlist" element={<AuthAdminWaitlist />} />
                  ) : null}
                </Route>
              </Routes>
            </NuqsAdapter>
          </MemoryRouter>
        </AppTrpcQueryProvider>
      </AppConfigProvider>
    </div>
  );
}

const meta = {
  title: "modules/auth/AuthAdminRouter",
  component: AuthAdminRouterStory,
  tags: ["autodocs"],
  args: {
    initialPath: "/admin/users",
    enableWaitlist: false,
    enableAccountClaimActions: true,
    enableAiUsage: false,
  },
} satisfies Meta<typeof AuthAdminRouterStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Users: Story = {};

export const Organizations: Story = {
  args: {
    initialPath: "/admin/organizations",
  },
};

export const WithWaitlistRoute: Story = {
  args: {
    enableWaitlist: true,
    initialPath: "/admin/waitlist",
  },
};

export const WithoutAccountClaimActions: Story = {
  args: {
    enableAccountClaimActions: false,
  },
};

export const WithAiUsage: Story = {
  args: {
    enableAiUsage: true,
  },
};
