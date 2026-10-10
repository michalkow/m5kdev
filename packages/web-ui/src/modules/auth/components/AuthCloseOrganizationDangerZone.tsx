import { Button, Card, FieldError, Form, Input, Label, TextField, toast } from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useUserOrganizations } from "@m5kdev/frontend/modules/auth/hooks/useUserOrganizations";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactElement, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

export function AuthCloseOrganizationDangerZone(): ReactElement | null {
  const { t } = useTranslation("web-ui");
  const { data: session } = useSession();
  const { data: organizations = [] } = useUserOrganizations();
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [typedName, setTypedName] = useState("");

  const activeOrganizationId = session?.session.activeOrganizationId;
  const isOwner = session?.session.activeOrganizationRole === "owner";
  const organizationName =
    organizations.find((organization) => organization.id === activeOrganizationId)?.name ?? "";

  const { mutate: closeOrganization, isPending } = useMutation(
    trpc.auth.closeOrganization.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.auth.listUserOrganizations.queryKey(),
        });
        navigate("/");
      },
      onError: (error: Error) => {
        toast.danger(error.message);
      },
    })
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    closeOrganization({ name: typedName });
  }

  if (!isOwner || !activeOrganizationId) return null;

  return (
    <Card className="border-danger/40">
      <Card.Header>
        <Card.Title>{t("web-ui:organization.preferences.dangerZone.title")}</Card.Title>
        <Card.Description>
          {t("web-ui:organization.preferences.dangerZone.description")}
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <Form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            <TextField
              name="name"
              isRequired
              value={typedName}
              onChange={setTypedName}
            >
              <Label>{t("web-ui:organization.preferences.dangerZone.nameLabel")}</Label>
              <Input placeholder={organizationName} autoComplete="off" />
              <FieldError />
            </TextField>
            <Button
              type="submit"
              variant="danger"
              isPending={isPending}
              isDisabled={typedName !== organizationName || organizationName.length === 0}
            >
              {t("web-ui:organization.preferences.dangerZone.submit")}
            </Button>
          </div>
        </Form>
      </Card.Content>
    </Card>
  );
}
