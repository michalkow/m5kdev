import { Button, Card, Chip, Input, Label, Spinner, TextArea } from "@heroui/react";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type OrganizationDetails = {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type OrganizationSettingsRouteLabels = {
  settingsTitle: string;
  settingsDescription: string;
  settingsNoActive: string;
  settingsManageOnly: string;
  formName: string;
  formSlug: string;
  formMetadata: string;
  formMetadataInvalidJson: string;
  formMetadataInvalid: string;
  saveButton: string;
  updateSuccess: string;
  updateError: string;
  loadError: string;
};

export type OrganizationSettingsRouteProps = {
  managerRoles?: string[];
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

function useOrganizationAccess({
  managerRoles,
  onInvalidateScopedQueries,
}: Pick<OrganizationSettingsRouteProps, "managerRoles" | "onInvalidateScopedQueries">) {
  const { data: session, registerSession } = useSession();
  const queryClient = useQueryClient();

  const activeOrganizationId = session?.session.activeOrganizationId ?? "";
  const activeOrganizationRole =
    (session?.session as { activeOrganizationRole?: string } | undefined)?.activeOrganizationRole ??
    "";
  const managerRoleSet = useMemo(() => new Set(managerRoles ?? ["admin", "owner"]), [managerRoles]);
  const canManageOrganization = managerRoleSet.has(activeOrganizationRole);

  const refreshOrganizationQueries = useCallback(async () => {
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ["auth-organization-list"] }),
      queryClient.invalidateQueries({
        queryKey: ["auth-organization-details", activeOrganizationId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["auth-organization-members", activeOrganizationId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["auth-organization-invitations", activeOrganizationId],
      }),
    ]);

    registerSession(() => {
      void onInvalidateScopedQueries?.();
    });
  }, [activeOrganizationId, onInvalidateScopedQueries, queryClient, registerSession]);

  return {
    activeOrganizationId,
    activeOrganizationRole,
    canManageOrganization,
    refreshOrganizationQueries,
  };
}

function useOrganizationConfig() {
  const { t } = useTranslation();

  const translatedLabels = useMemo<OrganizationSettingsRouteLabels>(
    () => ({
      settingsTitle: t("web-ui:organization.settings.title"),
      settingsDescription: t("web-ui:organization.settings.description"),
      settingsNoActive: t("web-ui:organization.settings.noActive"),
      settingsManageOnly: t("web-ui:organization.settings.manageOnly"),
      formName: t("web-ui:organization.settings.form.name"),
      formSlug: t("web-ui:organization.settings.form.slug"),
      formMetadata: t("web-ui:organization.settings.form.metadata"),
      formMetadataInvalidJson: t("web-ui:organization.settings.form.metadataInvalidJson"),
      formMetadataInvalid: t("web-ui:organization.settings.form.metadataInvalid"),
      saveButton: t("web-ui:organization.settings.button.save"),
      updateSuccess: t("web-ui:organization.settings.updateSuccess"),
      updateError: t("web-ui:organization.settings.updateError"),
      loadError: t("web-ui:organization.settings.loadError"),
    }),
    [t]
  );

  const translatedRoleLabels = useMemo<Record<string, string>>(
    () => ({
      member: t("web-ui:organization.roles.member"),
      admin: t("web-ui:organization.roles.admin"),
      owner: t("web-ui:organization.roles.owner"),
    }),
    [t]
  );

  return { resolvedLabels: translatedLabels, resolvedRoleLabels: translatedRoleLabels };
}

export function OrganizationSettingsRoute({
  managerRoles,
  onInvalidateScopedQueries,
}: OrganizationSettingsRouteProps) {
  const { resolvedLabels, resolvedRoleLabels } = useOrganizationConfig();

  const {
    activeOrganizationId,
    activeOrganizationRole,
    canManageOrganization,
    refreshOrganizationQueries,
  } = useOrganizationAccess({ managerRoles, onInvalidateScopedQueries });

  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [organizationMetadata, setOrganizationMetadata] = useState("{}");
  const [isSavingOrganization, setIsSavingOrganization] = useState(false);

  const organizationQuery = useQuery({
    queryKey: ["auth-organization-details", activeOrganizationId],
    enabled: Boolean(activeOrganizationId && canManageOrganization),
    queryFn: async () => {
      const { data, error } = await authClient.organization.getFullOrganization({
        query: {
          organizationId: activeOrganizationId,
          membersLimit: 200,
        },
      });
      if (error) {
        throw new Error(error.message ?? resolvedLabels.loadError);
      }
      return data as OrganizationDetails | null;
    },
  });

  useEffect(() => {
    const organization = organizationQuery.data;
    if (!organization) {
      return;
    }

    setOrganizationName(organization.name ?? "");
    setOrganizationSlug(organization.slug ?? "");
    setOrganizationMetadata(JSON.stringify(organization.metadata ?? {}, null, 2));
  }, [organizationQuery.data]);

  const onUpdateOrganization = async () => {
    if (!canManageOrganization || !activeOrganizationId) {
      return;
    }

    try {
      setIsSavingOrganization(true);
      let parsedMetadata: Record<string, unknown>;
      try {
        parsedMetadata = organizationMetadata.trim()
          ? (JSON.parse(organizationMetadata) as Record<string, unknown>)
          : {};
      } catch (parseError) {
        const message =
          parseError instanceof SyntaxError
            ? resolvedLabels.formMetadataInvalidJson
            : parseError instanceof Error
              ? parseError.message
              : resolvedLabels.formMetadataInvalid;
        throw new Error(message);
      }

      const { error } = await authClient.organization.update({
        organizationId: activeOrganizationId,
        data: {
          name: organizationName.trim(),
          slug: organizationSlug.trim(),
          metadata: parsedMetadata,
        },
      });

      if (error) {
        throw new Error(error.message ?? resolvedLabels.updateError);
      }

      await refreshOrganizationQueries();
      toast.success(resolvedLabels.updateSuccess);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : resolvedLabels.updateError);
    } finally {
      setIsSavingOrganization(false);
    }
  };

  if (!activeOrganizationId) {
    return (
      <OrganizationStateCard
        title={resolvedLabels.settingsTitle}
        message={resolvedLabels.settingsNoActive}
      />
    );
  }

  if (!canManageOrganization) {
    return (
      <OrganizationStateCard
        title={resolvedLabels.settingsTitle}
        message={resolvedLabels.settingsManageOnly}
      />
    );
  }

  if (organizationQuery.isLoading) {
    return (
      <div className="p-6 flex justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-6">
      <Card>
        <Card.Header className="flex items-center justify-between">
          <div className="flex flex-col">
            <h2 className="text-xl font-semibold">{resolvedLabels.settingsTitle}</h2>
            <p className="text-sm text-default-500">{resolvedLabels.settingsDescription}</p>
          </div>
          <Chip variant="soft" color="accent">
            {resolvedRoleLabels[activeOrganizationRole] ??
              activeOrganizationRole ??
              resolvedRoleLabels.member}
          </Chip>
        </Card.Header>
        <Card.Content className="grid gap-3">
          <div className="grid gap-2">
            <Label className="text-sm font-medium">{resolvedLabels.formName}</Label>
            <Input
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              variant="secondary"
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-sm font-medium">{resolvedLabels.formSlug}</Label>
            <Input
              value={organizationSlug}
              onChange={(e) => setOrganizationSlug(e.target.value)}
              variant="secondary"
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-sm font-medium">{resolvedLabels.formMetadata}</Label>
            <TextArea
              value={organizationMetadata}
              onChange={(e) => setOrganizationMetadata(e.target.value)}
              variant="secondary"
              rows={4}
            />
          </div>
          <div className="flex justify-end">
            <Button variant="primary" isPending={isSavingOrganization} onPress={onUpdateOrganization}>
              {resolvedLabels.saveButton}
            </Button>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
