import { Alert, Button, Card, CardBody, CardHeader, Input } from "@heroui/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { UseBackendTRPC } from "#types";

interface WaitlistCardProps {
  useTRPC: UseBackendTRPC;
}

export function WaitlistCard({ useTRPC }: WaitlistCardProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
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
        <CardBody className="pt-6">
          <Alert color="success" variant="faded" title={t("web-ui:auth.waitlist.success")} />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center flex flex-col gap-1">
        <p className="text-xl font-semibold">{t("web-ui:auth.waitlist.title")}</p>
        <p className="text-sm text-default-600">{t("web-ui:auth.waitlist.description")}</p>
      </CardHeader>
      <CardBody>
        <form onSubmit={handleSubmit} className="grid gap-6">
          <div className="grid gap-2">
            <Input
              type="email"
              label={t("web-ui:auth.waitlist.email")}
              labelPlacement="outside"
              placeholder={t("web-ui:auth.waitlist.placeholder.email")}
              isRequired
              variant="bordered"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" color="primary">
            {t("web-ui:auth.waitlist.button")}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
