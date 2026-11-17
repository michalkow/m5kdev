import {
  Button,
  Card,
  FieldError,
  Form,
  Input,
  Label,
  Spinner,
  TextField,
  toast,
} from "@heroui/react";
import { useAppRoles } from "@m5kdev/frontend/modules/app/hooks/useAppRoles";
import { useAuthClient } from "@m5kdev/frontend/modules/auth/hooks/useAuthClient";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { AvatarUpload } from "../../../components/AvatarUpload";

function OrganizationStateCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="p-6">
      <Card>
        <Card.Header>
          <Card.Title>{title}</Card.Title>
          <Card.Description>{message}</Card.Description>
        </Card.Header>
      </Card>
    </div>
  );
}

function OrganizationProfileForm({
  organization,
  updateOrganization,
  isPending,
  allowSlugChange = false,
}: {
  organization: { name: string; slug: string; logo?: string | null };
  updateOrganization: (data: { name: string; slug: string; logo?: string }) => void;
  isPending: boolean;
  allowSlugChange?: boolean;
}) {
  const [logo, setLogo] = useState<string | undefined>(organization.logo || undefined);
  const { t } = useTranslation();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const slug = allowSlugChange ? (formData.get("slug") as string) : organization.slug;
    updateOrganization({ name, slug, logo });
  }

  return (
    <Form onSubmit={handleSubmit}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-row gap-4 items-start">
          <AvatarUpload
            currentAvatarUrl={logo}
            onUploadComplete={(url) => {
              setLogo(url);
            }}
          />

          <TextField name="name" isRequired minLength={2} defaultValue={organization.name || ""}>
            <Label>{t("web-ui:organization.settings.form.name")}</Label>
            <Input placeholder={t("web-ui:organization.settings.form.namePlaceholder")} />
            <FieldError />
          </TextField>
          {allowSlugChange && (
            <TextField name="slug" isRequired minLength={2} defaultValue={organization.slug || ""}>
              <Label>{t("web-ui:organization.settings.form.slug")}</Label>
              <Input placeholder={t("web-ui:organization.settings.form.slugPlaceholder")} />
              <FieldError />
            </TextField>
          )}
        </div>
        <Button type="submit" isPending={isPending}>
          {t("web-ui:profile.saveChanges")}
        </Button>
      </div>
    </Form>
  );
}

export interface AuthOrganizationProfileProps {
  allowSlugChange?: boolean;
  managerRoles?: string[];
}

export function AuthOrganizationProfile({
  allowSlugChange = false,
  managerRoles,
}: AuthOrganizationProfileProps) {
  const authClient = useAuthClient();
  const { t } = useTranslation();
  const { data: session, isLoading: isLoadingSession } = useSession();
  const queryClient = useQueryClient();
  const organizationRoles = useAppRoles("organization");
  const resolvedManagerRoles = managerRoles ?? organizationRoles.managerRoles;
  const activeOrganizationId = session?.session.activeOrganizationId;
  const activeOrganizationRole = session?.session.activeOrganizationRole;
  const canManageOrganization = resolvedManagerRoles.includes(activeOrganizationRole ?? "");

  const {
    data: activeOrganization,
    isLoading: isLoadingActiveOrganization,
    isError: isOrganizationError,
  } = useQuery({
    queryKey: ["auth-organization-profile", activeOrganizationId],
    queryFn: async () => {
      const { data, error } = await authClient.organization.getOrganization({
        query: {
          organizationId: activeOrganizationId ?? undefined,
        },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: Boolean(!isLoadingSession && activeOrganizationId && canManageOrganization),
  });

  const { isPending: isSavingOrganization, mutate: updateOrganization } = useMutation({
    mutationFn: (data: { name: string; slug: string; logo?: string }) =>
      authClient.organization
        .update({
          organizationId: activeOrganizationId!,
          data,
        })
        .then((result) => {
          if (result.error) throw new Error(result.error.message);
          return result.data;
        }),
    onSuccess: () => {
      toast.success(t("web-ui:organization.settings.updateSuccess"));
      return queryClient.invalidateQueries({
        queryKey: ["auth-organization-profile", activeOrganizationId],
        exact: true,
      });
    },
    onError: (error) => {
      toast.danger(
        error instanceof Error ? error.message : t("web-ui:organization.settings.updateError")
      );
    },
  });

  if (
    isLoadingSession ||
    (activeOrganizationId && canManageOrganization && isLoadingActiveOrganization)
  )
    return (
      <div className="flex w-full justify-center items-center">
        <Spinner size="xl" color="current" />
      </div>
    );

  if (!activeOrganizationId)
    return (
      <OrganizationStateCard
        title={t("web-ui:organization.settings.title")}
        message={t("web-ui:organization.settings.noActive")}
      />
    );

  if (!canManageOrganization)
    return (
      <OrganizationStateCard
        title={t("web-ui:organization.settings.title")}
        message={t("web-ui:organization.settings.manageOnly")}
      />
    );

  if (isOrganizationError)
    return (
      <OrganizationStateCard
        title={t("web-ui:organization.settings.title")}
        message={t("web-ui:organization.settings.loadError")}
      />
    );

  if (!activeOrganization)
    return (
      <OrganizationStateCard
        title={t("web-ui:organization.settings.title")}
        message={t("web-ui:organization.settings.noActive")}
      />
    );

  return (
    <div>
      <div className="flex flex-col gap-1 mb-4">
        <p className="text-xl font-semibold">{t("web-ui:organization.settings.title")}</p>
        <p className="text-sm text-muted">{t("web-ui:organization.settings.description")}</p>
      </div>
      <OrganizationProfileForm
        key={activeOrganizationId}
        organization={activeOrganization}
        updateOrganization={updateOrganization}
        isPending={isSavingOrganization}
        allowSlugChange={allowSlugChange}
      />
    </div>
  );
}
