import { Button, Card, FieldError, Form, Input, Label, TextField, toast } from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, type ReactElement, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

export function AuthCloseUserDangerZone(): ReactElement {
  const { t } = useTranslation("web-ui");
  const { data: session } = useSession();
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const navigate = useNavigate();
  const email = session?.user?.email ?? "";
  const [typedEmail, setTypedEmail] = useState("");

  const { mutate: closeUser, isPending } = useMutation(
    trpc.auth.closeUser.mutationOptions({
      onSuccess: () => {
        void authClient.signOut().then(() => {
          navigate("/login");
        });
      },
      onError: (error: Error) => {
        toast.danger(error.message);
      },
    })
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    closeUser({ email: typedEmail });
  }

  return (
    <Card className="border-danger/40">
      <Card.Header>
        <Card.Title>{t("web-ui:preferences.dangerZone.title")}</Card.Title>
        <Card.Description>{t("web-ui:preferences.dangerZone.description")}</Card.Description>
      </Card.Header>
      <Card.Content>
        <Form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            <TextField
              name="email"
              isRequired
              value={typedEmail}
              onChange={setTypedEmail}
            >
              <Label>{t("web-ui:preferences.dangerZone.emailLabel")}</Label>
              <Input placeholder={email} autoComplete="off" />
              <FieldError />
            </TextField>
            <Button
              type="submit"
              variant="danger"
              isPending={isPending}
              isDisabled={typedEmail !== email || email.length === 0}
            >
              {t("web-ui:preferences.dangerZone.submit")}
            </Button>
          </div>
        </Form>
      </Card.Content>
    </Card>
  );
}
