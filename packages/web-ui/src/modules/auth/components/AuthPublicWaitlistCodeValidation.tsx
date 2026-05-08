import { Alert } from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

interface AuthPublicWaitlistCodeValidationProps {
  code: string;
}

export function AuthPublicWaitlistCodeValidation({ code }: AuthPublicWaitlistCodeValidationProps) {
  const { t } = useTranslation();
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const { data, isLoading, error } = useQuery(
    trpc.auth.validateWaitlistCode.queryOptions({ code })
  );
  const status = data?.status;

  const className = "p-1";

  if (isLoading) {
    return (
      <Alert className={className} status="default">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>
            {t("web-ui:auth.waitlist.validatingCode", {
              defaultValue: "Validating the invitation code...",
            })}
          </Alert.Title>
        </Alert.Content>
      </Alert>
    );
  }

  if (error) {
    return (
      <Alert className={className} status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>
            {t("web-ui:auth.waitlist.codeError", {
              defaultValue: "An error occurred while validating the invitation code.",
            })}
          </Alert.Title>
        </Alert.Content>
      </Alert>
    );
  }

  if (status === "VALID") {
    return (
      <Alert className={className} status="success">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>
            {t("web-ui:auth.waitlist.codeValid", {
              defaultValue: "Invitation code is valid. You can proceed.",
            })}
          </Alert.Title>
        </Alert.Content>
      </Alert>
    );
  }

  if (status) {
    let message = t("web-ui:auth.waitlist.invalidCode", {
      defaultValue: "Invalid invitation code.",
    });

    if (status === "EXPIRED") {
      message = t("web-ui:auth.waitlist.expiredCode", {
        defaultValue: "Invitation code has expired.",
      });
    } else if (status === "NOT_FOUND") {
      message = t("web-ui:auth.waitlist.codeNotFound", {
        defaultValue: "Invitation code not found.",
      });
    }

    return (
      <Alert className={className} status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{message}</Alert.Title>
        </Alert.Content>
      </Alert>
    );
  }

  return null;
}
