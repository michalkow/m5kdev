import { Alert } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { UseBackendTRPC } from "../../../types";

interface WaitlistCodeValidationProps {
  useTRPC: UseBackendTRPC;
  code: string;
}

export function WaitlistCodeValidation({ useTRPC, code }: WaitlistCodeValidationProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const { data, isLoading, error } = useQuery(
    trpc.auth.validateWaitlistCode.queryOptions({ code })
  );
  const status = data?.status;

  const className = "p-1";

  if (isLoading) {
    return (
      <Alert
        className={className}
        color="default"
        variant="faded"
        title={t("web-ui:auth.waitlist.validatingCode", {
          defaultValue: "Validating the invitation code...",
        })}
      />
    );
  }

  if (error) {
    return (
      <Alert
        className={className}
        color="danger"
        variant="faded"
        title={t("web-ui:auth.waitlist.codeError", {
          defaultValue: "An error occurred while validating the invitation code.",
        })}
      />
    );
  }

  if (status === "VALID") {
    return (
      <Alert
        className={className}
        color="success"
        variant="faded"
        title={t("web-ui:auth.waitlist.codeValid", {
          defaultValue: "Invitation code is valid. You can proceed.",
        })}
      />
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

    return <Alert className={className} color="danger" variant="faded" title={message} />;
  }

  return null;
}
