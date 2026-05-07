import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { AuthPublicLayout } from "./AuthPublicLayout";
import { AuthPublicLoginRoute } from "./AuthPublicLoginRoute";

interface AuthPublicLoginRouteStoryProps {
  readonly providers?: string[];
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

function AuthPublicLoginRouteStory({
  providers,
  header = <StoryHeader />,
}: AuthPublicLoginRouteStoryProps): ReactElement {
  return (
    <div className="bg-background text-foreground">
      <AppConfigProvider
        config={{
          appUrl: "http://localhost:6006",
          serverUrl: "http://localhost:3000",
          appName: "Storybook",
        }}
      >
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route element={<AuthPublicLayout header={header} />}>
              <Route path="/login" element={<AuthPublicLoginRoute providers={providers} />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppConfigProvider>
    </div>
  );
}

const meta = {
  title: "modules/auth/AuthPublicLoginRoute",
  component: AuthPublicLoginRouteStory,
  tags: ["autodocs"],
} satisfies Meta<typeof AuthPublicLoginRouteStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithSocialProviders: Story = {
  args: {
    providers: ["google", "linkedin", "microsoft"],
  },
};
