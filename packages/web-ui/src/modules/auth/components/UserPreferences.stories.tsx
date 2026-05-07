import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import type { Meta, StoryObj } from "@storybook/react";
import { type ReactElement, useCallback, useState } from "react";
import { Toaster } from "sonner";
import { z } from "zod";
import type { ControlsFor } from "./PreferencesEditor";
import { type UpdatePreferencesOptions, UserPreferences } from "./UserPreferences";

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

interface UserPreferencesStoryProps {
  readonly isLoading: boolean;
  readonly isPending: boolean;
  readonly initialPreferences: PreferencesValues;
}

function UserPreferencesStory({
  isLoading,
  isPending,
  initialPreferences,
}: UserPreferencesStoryProps): ReactElement {
  const [preferences, setPreferences] = useState<PreferencesValues>(initialPreferences);

  const updatePreferences = useCallback(
    (partial: Partial<PreferencesValues>, _options: UpdatePreferencesOptions) => {
      setPreferences((prev) => ({ ...prev, ...partial }));
    },
    []
  );

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
        <UserPreferences
          schema={preferencesSchema}
          controls={preferencesControls}
          preferences={preferences}
          isLoading={isLoading}
          isPending={isPending}
          updatePreferences={updatePreferences}
        />
      </AppConfigProvider>
    </div>
  );
}

const meta = {
  title: "modules/auth/UserPreferences",
  component: UserPreferencesStory,
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
} satisfies Meta<typeof UserPreferencesStory>;

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
