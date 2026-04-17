import { Card, Spinner } from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

type Phase = "idle" | "accepting" | "success" | "error";

export type OrganizationAcceptInvitationRouteProps = {
  loginPath?: string;
  signupPath?: string;
  defaultRedirectPath?: string;
  managerRedirectPath?: string;
  managerRoles?: string[];
  onInvalidateScopedQueries?: () => void | Promise<void>;
};

export function OrganizationAcceptInvitationRoute({
  signupPath = "/signup",
  defaultRedirectPath = "/",
  managerRedirectPath = "/organization/members",
  managerRoles = ["admin", "owner"],
  onInvalidateScopedQueries,
}: OrganizationAcceptInvitationRouteProps) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { data: session, registerSession } = useSession();
  const navigate = useNavigate();
  const invitationId = searchParams.get("id");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const managerRoleSet = useMemo(() => new Set(managerRoles), [managerRoles]);
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const { data: invitationData } = useQuery(
    trpc.auth.readInvitation.queryOptions({ id: invitationId || "" }, { enabled: !!invitationId })
  );

  useEffect(() => {
    if (!invitationId) {
      setPhase("error");
      setErrorMessage(t("web-ui:organization.invitation.errorMissing"));
      return;
    }

    if (!session && invitationData) {
      const search = new URLSearchParams({
        invitation: invitationId,
        email: invitationData.email,
      }).toString();
      navigate(`${signupPath}?${search}`, { replace: true });
    }
  }, [invitationId, signupPath, navigate, session, invitationData]);

  useEffect(() => {
    if (!session || !invitationId || phase !== "idle") {
      return;
    }

    let isMounted = true;

    const run = async () => {
      try {
        setPhase("accepting");
        const { data, error } = await authClient.organization.acceptInvitation({ invitationId });
        if (error) {
          throw new Error(error.message ?? t("web-ui:organization.invitation.acceptFailed"));
        }

        const organizationId =
          (data as { invitation?: { organizationId?: string } | null } | null)?.invitation
            ?.organizationId ?? null;
        const invitationRole =
          (data as { invitation?: { role?: string } | null } | null)?.invitation?.role ?? "member";

        if (organizationId) {
          const result = await authClient.organization.setActive({ organizationId });
          if (result.error) {
            throw new Error(
              result.error.message ?? t("web-ui:organization.invitation.activateFailed")
            );
          }
        }

        registerSession(() => {
          void onInvalidateScopedQueries?.();
        });

        if (isMounted) {
          setPhase("success");
          toast.success(t("web-ui:organization.invitation.accepted"));
          navigate(managerRoleSet.has(invitationRole) ? managerRedirectPath : defaultRedirectPath, {
            replace: true,
          });
        }
      } catch (error) {
        if (isMounted) {
          setPhase("error");
          setErrorMessage(
            error instanceof Error
              ? error.message
              : t("web-ui:organization.invitation.acceptFailed")
          );
        }
      }
    };

    void run();

    return () => {
      isMounted = false;
    };
  }, [
    defaultRedirectPath,
    invitationId,
    managerRedirectPath,
    managerRoleSet,
    navigate,
    onInvalidateScopedQueries,
    phase,
    registerSession,
    session,
    t,
  ]);

  if (phase === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-lg">
          <Card.Header className="text-lg font-semibold">
            {t("web-ui:organization.invitation.error")}
          </Card.Header>
          <Card.Content>
            {errorMessage ?? t("web-ui:organization.invitation.unableAccept")}
          </Card.Content>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <Card.Header className="text-lg font-semibold">
          {t("web-ui:organization.invitation.accepting")}
        </Card.Header>
        <Card.Content className="flex items-center gap-3">
          <Spinner size="sm" />
          <span>
            {phase === "success"
              ? t("web-ui:organization.invitation.redirecting")
              : t("web-ui:organization.invitation.pleaseWait")}
          </span>
        </Card.Content>
      </Card>
    </div>
  );
}
