import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { AuthPublicLayout } from "./AuthPublicLayout";
import { AuthPublicResetPasswordRoute } from "./AuthPublicResetPasswordRoute";

interface AuthPublicResetPasswordRouteStoryProps {
  readonly header?: ReactNode;
}

function StoryHeader(): ReactElement {
  return (
    <>
      <div className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
        A
      </div>
      Acme Inc.
    </>
  );
}

function AuthPublicResetPasswordRouteStory({
  header = <StoryHeader />,
}: AuthPublicResetPasswordRouteStoryProps): ReactElement {
  return (
    <div className="bg-background text-foreground">
      <AppConfigProvider
        config={{
          appUrl: "http://localhost:6006",
          serverUrl: "http://localhost:3000",
          appName: "Storybook",
        }}
      >
        <MemoryRouter initialEntries={["/reset-password?token=storybook"]}>
          <Routes>
            <Route element={<AuthPublicLayout header={header} />}>
              <Route path="/reset-password" element={<AuthPublicResetPasswordRoute />} />
              <Route path="/login" element={<div>Login</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppConfigProvider>
    </div>
  );
}

const meta = {
  title: "modules/auth/AuthPublicResetPasswordRoute",
  component: AuthPublicResetPasswordRouteStory,
  tags: ["autodocs"],
} satisfies Meta<typeof AuthPublicResetPasswordRouteStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
