import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { LoginRoute } from "./LoginRoute";
import { PublicAuthLayout } from "./PublicAuthLayout";

interface LoginRouteStoryProps {
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

function LoginRouteStory({
  providers,
  header = <StoryHeader />,
}: LoginRouteStoryProps): ReactElement {
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
            <Route element={<PublicAuthLayout header={header} />}>
              <Route path="/login" element={<LoginRoute providers={providers} />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppConfigProvider>
    </div>
  );
}

const meta = {
  title: "modules/auth/LoginRoute",
  component: LoginRouteStory,
  tags: ["autodocs"],
} satisfies Meta<typeof LoginRouteStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithSocialProviders: Story = {
  args: {
    providers: ["google", "linkedin", "microsoft"],
  },
};
