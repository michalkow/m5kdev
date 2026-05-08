import {
  Alert,
  Button,
  Card,
  FieldError,
  Form,
  Input,
  Label,
  TextField,
  toast,
} from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function AuthPublicWaitlistCard() {
  const { t } = useTranslation();
  const trpc = useAppTRPC<BackendTRPCRouter>();

  const [joined, setJoined] = useState(false);

  const { mutate } = useMutation(trpc.auth.joinWaitlist.mutationOptions());

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    mutate(
      { email },
      {
        onSuccess: () => {
          setJoined(true);
        },
        onError: (error) => {
          toast.danger(
            error instanceof Error
              ? error.message
              : t("web-ui:auth.waitlist.error", {
                  defaultValue: "Failed to join waitlist. Please try again.",
                })
          );
        },
      }
    );
  };

  if (joined) {
    return (
      <Card>
        <Card.Content className="pt-6">
          <Alert status="success">
            <Alert.Title>{t("web-ui:auth.waitlist.success")}</Alert.Title>
          </Alert>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Header className="text-center flex flex-col gap-1">
        <p className="text-xl font-semibold">{t("web-ui:auth.waitlist.title")}</p>
        <p className="text-sm text-default-600">{t("web-ui:auth.waitlist.description")}</p>
      </Card.Header>
      <Card.Content>
        <Form onSubmit={handleSubmit} className="grid gap-6">
          <TextField name="email" type="email" variant="secondary" isRequired>
            <Label>{t("web-ui:auth.waitlist.email")}</Label>
            <Input placeholder={t("web-ui:auth.waitlist.placeholder.email")} />
            <FieldError />
          </TextField>
          <Button type="submit" variant="primary">
            {t("web-ui:auth.waitlist.button")}
          </Button>
        </Form>
      </Card.Content>
    </Card>
  );
}
