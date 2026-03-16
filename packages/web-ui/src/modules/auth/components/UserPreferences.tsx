import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
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

  const labels: PreferenceEditorLabels = {
    title: t("web-ui:preferences.title"),
    submit: t("web-ui:preferences.submit"),
    updated: t("web-ui:preferences.updated"),
    updateError: t("web-ui:preferences.updateError"),
    loading: t("web-ui:preferences.loading"),
  };

  return (
    <PreferencesEditor
      schema={schema}
      controls={controls}
      values={preferences}
      isLoading={isLoading}
      isPending={isPending}
      labels={labels}
      updateValues={updatePreferences}
    />
  );
}
