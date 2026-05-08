import { Button, Card, FieldError, Form, Input, Label, TextField, toast } from "@heroui/react";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { AvatarUpload } from "../../../components/AvatarUpload";
import { AppLoader } from "../../app/components/AppLoader";

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

          <TextField name="name" isRequired minLength={2}>
            <Label>{t("web-ui:organization.profile.name")}</Label>
            <Input
              placeholder={t("web-ui:organization.profile.placeholders.name")}
              defaultValue={organization.name || ""}
            />
            <FieldError />
          </TextField>
          {allowSlugChange && (
            <TextField name="slug" isRequired minLength={2}>
              <Label>{t("web-ui:organization.profile.slug")}</Label>
              <Input
                placeholder={t("web-ui:organization.profile.placeholders.slug")}
                defaultValue={organization.slug || ""}
              />
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
  managerRoles = ["admin", "owner"],
}: AuthOrganizationProfileProps) {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const { data: activeOrganization, isPending: isLoadingActiveOrganization } =
    authClient.useActiveOrganization();

  const activeOrganizationId = activeOrganization?.id;
  const activeOrganizationRole = session?.session.activeOrganizationRole;
  const canManageOrganization = managerRoles.includes(activeOrganizationRole ?? "");

  const { isPending: isSavingOrganization, mutate: updateOrganization } = useMutation({
    mutationFn: (data: { name: string; slug: string; logo?: string }) =>
      authClient.organization
        .update({
          organizationId: activeOrganizationId,
          data,
        })
        .then((result) => {
          if (result.error) throw new Error(result.error.message);
          return result.data;
        }),
    onSuccess: () => {
      toast.success(t("web-ui:organization.settings.updated"));
    },
    onError: (error) => {
      toast.danger(
        error instanceof Error ? error.message : t("web-ui:organization.settings.error")
      );
    },
  });

  if (!activeOrganization || !activeOrganizationId)
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

  if (isLoadingActiveOrganization) return <AppLoader />;

  return (
    <div className="p-6">
      <Card>
        <Card.Header className="flex items-center justify-between">
          <Card.Title>{t("web-ui:organization.settings.title")}</Card.Title>
          <Card.Description>{t("web-ui:organization.settings.description")}</Card.Description>
        </Card.Header>
        <Card.Content className="grid gap-3">
          <OrganizationProfileForm
            organization={activeOrganization}
            updateOrganization={updateOrganization}
            isPending={isSavingOrganization}
            allowSlugChange={allowSlugChange}
          />
        </Card.Content>
      </Card>
    </div>
  );
}
