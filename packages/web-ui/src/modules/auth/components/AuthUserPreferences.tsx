import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { AuthUserProfileEditor } from "./AuthUserProfileEditor";
import {
  AuthUtilityPreferencesEditor,
  type ControlsFor,
  type PreferenceEditorLabels,
} from "./AuthUtilityPreferencesEditor";
import { AuthUtilityThemePicker } from "./AuthUtilityThemePicker";
import { AuthUtilityLocalePicker } from "./AuthUtilityLocalePicker";

export interface AuthUserPreferencesProps<S extends z.ZodObject<z.ZodRawShape>> {
  schema: S;
  controls: ControlsFor<z.infer<S>>;
  hideProfileEditor?: boolean;
  hideThemePicker?: boolean;
  hideLocalePicker?: boolean;
}

export function AuthUserPreferences<S extends z.ZodObject<z.ZodRawShape>>({
  schema,
  controls,
  hideProfileEditor = false,
  hideThemePicker = false,
  hideLocalePicker = false,
}: AuthUserPreferencesProps<S>): ReactElement {
  const { t } = useTranslation("web-ui");
  const trpc = useAppTRPC<BackendTRPCRouter>();

  const { data: preferences = {}, isLoading: isPreferencesLoading } = useQuery(
    trpc.auth.getPreferences.queryOptions()
  );
  const { mutate: setPreferences, isPending: isSetPreferencesPending } = useMutation(
    trpc.auth.setPreferences.mutationOptions()
  );

  const labels: PreferenceEditorLabels = {
    title: t("web-ui:preferences.title"),
    submit: t("web-ui:preferences.submit"),
    updated: t("web-ui:preferences.updated"),
    updateError: t("web-ui:preferences.updateError"),
    loading: t("web-ui:preferences.loading"),
  };

  return (
    <div className="container py-10 px-4">
      <div className="flex flex-col gap-8">
        {!hideProfileEditor && <AuthUserProfileEditor />}
        {!hideThemePicker && <AuthUtilityThemePicker />}
        {!hideLocalePicker && <AuthUtilityLocalePicker />}
        <AuthUtilityPreferencesEditor
          schema={schema}
          controls={controls}
          values={preferences}
          isLoading={isPreferencesLoading}
          isPending={isSetPreferencesPending}
          labels={labels}
          updateValues={setPreferences}
        />
      </div>
    </div>
  );
}
