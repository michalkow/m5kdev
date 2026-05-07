import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import { AppTrpcQueryProvider } from "@m5kdev/frontend/modules/app/components/AppTrpcQueryProvider";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactElement } from "react";
import { Toaster } from "sonner";
import { z } from "zod";
import { AuthUserPreferences } from "./AuthUserPreferences";
import type { ControlsFor } from "./AuthUtilityPreferencesEditor";

const preferencesSchema = z.object({
  emailNotifications: z.boolean(),
  theme: z.enum(["light", "dark", "system"]),
  itemsPerPage: z.number().min(5).max(100),
});

type PreferencesValues = z.infer<typeof preferencesSchema>;

const preferencesControls: ControlsFor<PreferencesValues> = {
  emailNotifications: {
    label: "Email notifications",
    element: "switch",
  },
  theme: {
    label: "Theme",
    element: "select",
    options: [
      { label: "Light", value: "light" },
      { label: "Dark", value: "dark" },
      { label: "System", value: "system" },
    ],
  },
  itemsPerPage: {
    label: "Items per page",
    element: "number",
    min: 5,
    max: 100,
    step: 5,
  },
};

function AuthUserPreferencesStory(): ReactElement {
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
          <AuthUserPreferences schema={preferencesSchema} controls={preferencesControls} />
        </AppTrpcQueryProvider>
      </AppConfigProvider>
    </div>
  );
}

const meta = {
  title: "modules/auth/AuthUserPreferences",
  component: AuthUserPreferencesStory,
  tags: ["autodocs"],
  args: {
    isLoading: false,
    isPending: false,
    initialPreferences: {
      emailNotifications: true,
      theme: "system",
      itemsPerPage: 25,
    } satisfies PreferencesValues,
  },
} satisfies Meta<typeof AuthUserPreferencesStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

export const SubmitPending: Story = {
  args: {
    isPending: true,
  },
};
