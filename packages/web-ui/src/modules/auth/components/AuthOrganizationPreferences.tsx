import { toast } from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import {
  AuthOrganizationProfile,
  type AuthOrganizationProfileProps,
} from "./AuthOrganizationProfile";
import {
  AuthUtilityPreferencesEditor,
  type ControlsFor,
  type PreferenceEditorLabels,
} from "./AuthUtilityPreferencesEditor";

type AuthOrganizationPreferenceLabels = PreferenceEditorLabels & {
  noActiveOrganization: string;
  loadError: string;
};

export interface AuthOrganizationPreferencesProps<S extends z.ZodObject<z.ZodRawShape>>
  extends AuthOrganizationProfileProps {
  schema: S;
  controls: ControlsFor<z.infer<S>>;
  onInvalidateScopedQueries?: () => void | Promise<void>;
}

export function AuthOrganizationPreferences<S extends z.ZodObject<z.ZodRawShape>>({
  schema,
  controls,
  onInvalidateScopedQueries,
  ...profileProps
}: AuthOrganizationPreferencesProps<S>): ReactElement {
  const { data: session } = useSession();
  const { t } = useTranslation("web-ui");
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const queryClient = useQueryClient();

  const activeOrganizationId = session?.session.activeOrganizationId;

  const resolvedLabels = useMemo<AuthOrganizationPreferenceLabels>(
    () => ({
      title: t("web-ui:organization.preferences.title"),
      submit: t("web-ui:organization.preferences.submit"),
      updated: t("web-ui:organization.preferences.updated"),
      updateError: t("web-ui:organization.preferences.updateError"),
      loading: t("web-ui:organization.preferences.loading"),
      noActiveOrganization: t("web-ui:organization.preferences.noActive"),
      loadError: t("web-ui:organization.preferences.loadError"),
    }),
    [t]
  );

  const { data: preferences = {}, isLoading: isPreferencesLoading } = useQuery(
    trpc.auth.getOrganizationPreferences.queryOptions(undefined, {
      enabled: Boolean(activeOrganizationId),
    })
  );

  const { mutate: setPreferences, isPending: isSetPreferencesPending } = useMutation(
    trpc.auth.setOrganizationPreferences.mutationOptions({
      onSuccess: async (result) => {
        queryClient.setQueryData(trpc.auth.getOrganizationPreferences.queryKey(), result);
        await onInvalidateScopedQueries?.();
      },
      onError: async (error) => {
        toast.danger(error instanceof Error ? error.message : resolvedLabels.updateError);
      },
    })
  );

  return (
    <div className="container py-10 px-4">
      <div className="flex flex-col gap-8">
        <AuthOrganizationProfile {...profileProps} />
        <AuthUtilityPreferencesEditor
          schema={schema}
          controls={controls}
          values={preferences}
          isLoading={isPreferencesLoading}
          isPending={isSetPreferencesPending}
          labels={resolvedLabels}
          updateValues={setPreferences}
        />
      </div>
    </div>
  );
}
