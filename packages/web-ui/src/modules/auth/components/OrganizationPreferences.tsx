import {Card} from "@heroui/react";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import type { UseBackendTRPC } from "../../../types";
import {
  type ControlsFor,
  type PreferenceEditorLabels,
  PreferencesEditor,
  type UpdatePreferencesOptions,
} from "./PreferencesEditor";

type OrganizationPreferenceLabels = PreferenceEditorLabels & {
  noActiveOrganization: string;
  loadError: string;
};

export type OrganizationPreferencesTarget = "preferences" | "flags";

export type OrganizationPreferencesProps<S extends z.ZodObject<z.ZodRawShape>> = {
  useTRPC: UseBackendTRPC;
  schema: S;
  controls: ControlsFor<z.infer<S>>;
  target?: OrganizationPreferencesTarget;
  labels?: Partial<OrganizationPreferenceLabels>;
  onInvalidateScopedQueries?: () => void | Promise<void>;
};

function OrganizationStateCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="p-6">
      <Card>
        <Card.Header className="text-lg font-semibold">{title}</Card.Header>
        <Card.Content>{message}</Card.Content>
      </Card>
    </div>
  );
}

function getFlagValues<S extends z.ZodObject<z.ZodRawShape>>(
  controls: ControlsFor<z.infer<S>>,
  flags: string[]
): Partial<z.infer<S>> {
  const activeFlags = new Set(flags);

  return Object.fromEntries(
    Object.keys(controls).map((key) => [key, activeFlags.has(key)])
  ) as Partial<z.infer<S>>;
}

function getFlagsFromValues(values: Record<string, unknown>): string[] {
  return Object.entries(values)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
}

export function OrganizationPreferences<S extends z.ZodObject<z.ZodRawShape>>({
  useTRPC,
  schema,
  controls,
  target = "preferences",
  labels,
  onInvalidateScopedQueries,
}: OrganizationPreferencesProps<S>): ReactElement {
  const { data: session, isLoading: isSessionLoading } = useSession();
  const { t } = useTranslation("web-ui");
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const activeOrganizationId = session?.session.activeOrganizationId ?? "";
  const labelKeyPrefix =
    target === "flags" ? "web-ui:organization.flags" : "web-ui:organization.preferences";

  const resolvedLabels = useMemo<OrganizationPreferenceLabels>(
    () => ({
      title: labels?.title ?? t(`${labelKeyPrefix}.title`),
      submit: labels?.submit ?? t(`${labelKeyPrefix}.submit`),
      updated: labels?.updated ?? t(`${labelKeyPrefix}.updated`),
      updateError: labels?.updateError ?? t(`${labelKeyPrefix}.updateError`),
      loading: labels?.loading ?? t(`${labelKeyPrefix}.loading`),
      noActiveOrganization: labels?.noActiveOrganization ?? t(`${labelKeyPrefix}.noActive`),
      loadError: labels?.loadError ?? t(`${labelKeyPrefix}.loadError`),
    }),
    [labelKeyPrefix, labels, t]
  );

  const preferencesQuery = useQuery({
    ...trpc.auth.getOrganizationPreferences.queryOptions(),
    enabled: target === "preferences" && Boolean(activeOrganizationId),
  });

  const flagsQuery = useQuery({
    ...trpc.auth.getOrganizationFlags.queryOptions(),
    enabled: target === "flags" && Boolean(activeOrganizationId),
  });

  const setPreferencesMutation = useMutation(
    trpc.auth.setOrganizationPreferences.mutationOptions()
  );
  const setFlagsMutation = useMutation(trpc.auth.setOrganizationFlags.mutationOptions());

  const currentValues = useMemo<Partial<z.infer<S>>>(() => {
    if (target === "flags") {
      return getFlagValues<S>(controls, flagsQuery.data ?? []);
    }

    return (preferencesQuery.data ?? {}) as Partial<z.infer<S>>;
  }, [controls, flagsQuery.data, preferencesQuery.data, target]);

  const updateValues = useCallback(
    (partialValues: Partial<z.infer<S>>, options: UpdatePreferencesOptions) => {
      if (target === "flags") {
        const nextValues = {
          ...currentValues,
          ...partialValues,
        } as Record<string, unknown>;
        const nextFlags = getFlagsFromValues(nextValues);

        if (!options.noOptimisticUpdate) {
          queryClient.setQueryData(trpc.auth.getOrganizationFlags.queryKey(), nextFlags);
        }

        setFlagsMutation.mutate(nextFlags, {
          onSuccess: async (result) => {
            queryClient.setQueryData(trpc.auth.getOrganizationFlags.queryKey(), result);
            if (activeOrganizationId) {
              await queryClient.invalidateQueries({
                queryKey: ["auth-organization-details", activeOrganizationId],
              });
            }
            await onInvalidateScopedQueries?.();
            options.onSuccess?.();
          },
          onError: async (error) => {
            if (!options.noOptimisticUpdate) {
              await queryClient.invalidateQueries({
                queryKey: trpc.auth.getOrganizationFlags.queryKey(),
              });
            }
            options.onError?.(error);
          },
        });
        return;
      }

      const nextPreferences = {
        ...(preferencesQuery.data ?? {}),
        ...partialValues,
      };

      if (!options.noOptimisticUpdate) {
        queryClient.setQueryData(trpc.auth.getOrganizationPreferences.queryKey(), nextPreferences);
      }

      setPreferencesMutation.mutate(nextPreferences, {
        onSuccess: async (result) => {
          queryClient.setQueryData(trpc.auth.getOrganizationPreferences.queryKey(), result);
          if (activeOrganizationId) {
            await queryClient.invalidateQueries({
              queryKey: ["auth-organization-details", activeOrganizationId],
            });
          }
          await onInvalidateScopedQueries?.();
          options.onSuccess?.();
        },
        onError: async (error) => {
          if (!options.noOptimisticUpdate) {
            await queryClient.invalidateQueries({
              queryKey: trpc.auth.getOrganizationPreferences.queryKey(),
            });
          }
          options.onError?.(error);
        },
      });
    },
    [
      activeOrganizationId,
      currentValues,
      onInvalidateScopedQueries,
      preferencesQuery.data,
      queryClient,
      setFlagsMutation,
      setPreferencesMutation,
      target,
      trpc.auth.getOrganizationFlags,
      trpc.auth.getOrganizationPreferences,
    ]
  );

  const isLoading =
    isSessionLoading || (target === "flags" ? flagsQuery.isLoading : preferencesQuery.isLoading);
  const isPending =
    target === "flags" ? setFlagsMutation.isPending : setPreferencesMutation.isPending;
  const queryError = target === "flags" ? flagsQuery.error : preferencesQuery.error;

  if (!isSessionLoading && !activeOrganizationId) {
    return (
      <OrganizationStateCard
        title={resolvedLabels.title}
        message={resolvedLabels.noActiveOrganization}
      />
    );
  }

  if (queryError) {
    return (
      <OrganizationStateCard
        title={resolvedLabels.title}
        message={queryError instanceof Error ? queryError.message : resolvedLabels.loadError}
      />
    );
  }

  return (
    <PreferencesEditor
      schema={schema}
      controls={controls}
      values={currentValues}
      isLoading={isLoading}
      isPending={isPending}
      labels={resolvedLabels}
      updateValues={updateValues}
    />
  );
}
