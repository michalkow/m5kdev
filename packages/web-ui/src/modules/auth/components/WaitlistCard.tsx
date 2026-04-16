import { Alert, Button, Card, Input, Label } from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function WaitlistCard() {
  const { t } = useTranslation();
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const emailInputId = useId();
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);

  const { mutate } = useMutation(trpc.auth.joinWaitlist.mutationOptions());

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    mutate(
      { email },
      {
        onSuccess: () => {
          setJoined(true);
        },
        onError: (error) => {
          toast.error(
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
        <form onSubmit={handleSubmit} className="grid gap-6">
          <div className="grid gap-2">
            <Label className="text-sm font-medium" htmlFor={emailInputId}>
              {t("web-ui:auth.waitlist.email")}
            </Label>
            <Input
              id={emailInputId}
              type="email"
              placeholder={t("web-ui:auth.waitlist.placeholder.email")}
              required
              variant="secondary"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" variant="primary">
            {t("web-ui:auth.waitlist.button")}
          </Button>
        </form>
      </Card.Content>
    </Card>
  );
}
