import type { Meta, StoryObj } from "@storybook/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";

import { AuthLayout } from "./AuthLayout";
import { LoginRoute } from "./LoginRoute";

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
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route element={<AuthLayout header={header} />}>
            <Route path="/login" element={<LoginRoute providers={providers} />} />
          </Route>
        </Routes>
      </MemoryRouter>
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
