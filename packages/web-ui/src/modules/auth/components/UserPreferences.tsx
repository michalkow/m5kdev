import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

import {
  type ControlsFor,
  type PreferenceEditorLabels,
  PreferencesEditor,
  type UpdatePreferencesOptions,
} from "./PreferencesEditor";

export type {
  ControlDefinition,
  ControlsFor,
  PreferenceEditorLabels,
  UpdatePreferencesOptions,
} from "./PreferencesEditor";

import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { toast } from "sonner";
import { z } from "zod";
import { ProfileEditor } from "./ProfileRoute";

const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  image: z.string().nullable(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;
export function UserPreferences<S extends z.ZodObject<z.ZodRawShape>>({
  schema,
  controls,
  preferences,
  isLoading,
  isPending,
  updatePreferences,
}: {
  schema: S;
  controls: ControlsFor<z.infer<S>>;
  preferences: z.infer<S>;
  isLoading: boolean;
  isPending: boolean;
  updatePreferences: (
    partialPreferences: Partial<z.infer<S>>,
    options: UpdatePreferencesOptions
  ) => void;
}): ReactElement {
  const { t } = useTranslation("web-ui");

  const { data: session } = useSession();

  function handleSubmit(data: ProfileFormValues): void {
    authClient
      .updateUser(data)
      .then(() => {
        toast.success(t("web-ui:profile.updated"), {
          description: t("web-ui:profile.updateDescription"),
        });
      })
      .catch(() => {
        toast.error(t("web-ui:profile.error"), {
          description: t("web-ui:profile.errorDescription"),
        });
      });
  }

  const labels: PreferenceEditorLabels = {
    title: t("web-ui:preferences.title"),
    submit: t("web-ui:preferences.submit"),
    updated: t("web-ui:preferences.updated"),
    updateError: t("web-ui:preferences.updateError"),
    loading: t("web-ui:preferences.loading"),
  };

  return (
    <>
      <ProfileEditor
        initialValues={{
          name: session?.user?.name || "",
          image: session?.user?.image || null,
        }}
        onSubmit={handleSubmit}
      />
      <PreferencesEditor
        schema={schema}
        controls={controls}
        values={preferences}
        isLoading={isLoading}
        isPending={isPending}
        labels={labels}
        updateValues={updatePreferences}
      />
    </>
  );
}
