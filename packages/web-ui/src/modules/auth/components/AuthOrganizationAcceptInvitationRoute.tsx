import { Button, Card, Spinner } from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useAppRoles } from "@m5kdev/frontend/modules/app/hooks/useAppRoles";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

type Phase = "idle" | "accepting" | "success" | "error" | "mismatch";

export interface AuthOrganizationAcceptInvitationRouteProps {
  loginPath?: string;
  signupPath?: string;
  defaultRedirectPath?: string;
  managerRedirectPath?: string;
  managerRoles?: string[];
  onInvalidateScopedQueries?: () => void | Promise<void>;
}

function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

function isInvitationEmailMismatch(error: unknown): boolean {
  return error instanceof Error && /invitation email does not match/i.test(error.message);
}

export function AuthOrganizationAcceptInvitationRoute({
  signupPath = "/signup",
  defaultRedirectPath = "/",
  managerRedirectPath = "/organization/members",
  managerRoles,
  onInvalidateScopedQueries,
}: AuthOrganizationAcceptInvitationRouteProps) {
  const { t } = useTranslation();
  const organizationRoles = useAppRoles("organization");
  const resolvedManagerRoles = managerRoles ?? organizationRoles.managerRoles;
  const [searchParams] = useSearchParams();
  const { data: session, isLoading, registerSession } = useSession();
  const navigate = useNavigate();
  const invitationId = searchParams.get("id");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mismatchEmails, setMismatchEmails] = useState<{
    invitedEmail: string;
    sessionEmail: string;
  } | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const acceptStartedRef = useRef(false);
  const managerRoleSet = useMemo(() => new Set(resolvedManagerRoles), [resolvedManagerRoles]);
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const { mutateAsync: acceptOrganizationInvitation } = useMutation(
    trpc.auth.acceptOrganizationInvitation.mutationOptions()
  );
  const { data: invitationData, isError: invitationFailed } = useQuery(
    trpc.auth.readInvitation.queryOptions({ id: invitationId || "" }, { enabled: !!invitationId })
  );
  const sessionUserId = session?.user?.id;
  const sessionEmail = session?.user?.email;
  const invitedEmail = invitationData?.email;

  const signupSearch = useMemo(() => {
    if (!invitationId || !invitedEmail) {
      return null;
    }
    return new URLSearchParams({
      invitation: invitationId,
      email: invitedEmail,
    }).toString();
  }, [invitationId, invitedEmail]);

  useEffect(() => {
    if (!invitationId) {
      setPhase("error");
      setErrorMessage(t("web-ui:organization.invitation.errorMissing"));
      return;
    }

    if (invitationFailed) {
      setPhase("error");
      setErrorMessage(t("web-ui:organization.invitation.unableAccept"));
      return;
    }

    if (isLoading) {
      return;
    }

    if (!session && invitationData && signupSearch) {
      navigate(`${signupPath}?${signupSearch}`, { replace: true });
    }
  }, [
    invitationFailed,
    invitationId,
    invitationData,
    isLoading,
    navigate,
    session,
    signupPath,
    signupSearch,
    t,
  ]);

  useEffect(() => {
    if (
      !sessionUserId ||
      !invitationId ||
      !invitationData ||
      acceptStartedRef.current ||
      phase !== "idle"
    ) {
      return;
    }

    const currentEmail = normalizeEmail(sessionEmail);
    const targetEmail = normalizeEmail(invitedEmail);
    if (!currentEmail || currentEmail !== targetEmail) {
      setMismatchEmails({
        invitedEmail: invitedEmail ?? "",
        sessionEmail: sessionEmail ?? "",
      });
      setPhase("mismatch");
      return;
    }

    acceptStartedRef.current = true;
    let cancelled = false;

    const run = async (): Promise<void> => {
      try {
        setPhase("accepting");
        const accepted = await acceptOrganizationInvitation({ id: invitationId });
        const organizationId = accepted.organizationId;
        const invitationRole = accepted.role;

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

        setPhase("success");
        toast.success(t("web-ui:organization.invitation.accepted"));
        if (!cancelled) {
          navigate(managerRoleSet.has(invitationRole) ? managerRedirectPath : defaultRedirectPath, {
            replace: true,
          });
        }
      } catch (error) {
        if (isInvitationEmailMismatch(error)) {
          setMismatchEmails({
            invitedEmail: invitedEmail ?? "",
            sessionEmail: sessionEmail ?? "",
          });
          setPhase("mismatch");
          return;
        }
        setPhase("error");
        setErrorMessage(
          error instanceof Error ? error.message : t("web-ui:organization.invitation.acceptFailed")
        );
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    acceptOrganizationInvitation,
    defaultRedirectPath,
    invitationData,
    invitationId,
    invitedEmail,
    managerRedirectPath,
    managerRoleSet,
    navigate,
    onInvalidateScopedQueries,
    phase,
    registerSession,
    sessionEmail,
    sessionUserId,
    t,
  ]);

  const handleSwitchAccount = (): void => {
    setSigningOut(true);
    void authClient
      .signOut()
      .then(() => {
        registerSession();
      })
      .catch(() => {
        setSigningOut(false);
      });
  };

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

  if (phase === "mismatch") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-lg">
          <Card.Header className="text-lg font-semibold">
            {t("web-ui:organization.invitation.wrongAccount")}
          </Card.Header>
          <Card.Content className="flex flex-col gap-4">
            <p>
              {t("web-ui:organization.invitation.emailMismatch", {
                invitedEmail: mismatchEmails?.invitedEmail ?? invitedEmail ?? "",
                sessionEmail: mismatchEmails?.sessionEmail ?? sessionEmail ?? "",
              })}
            </p>
            <Button
              variant="primary"
              onPress={handleSwitchAccount}
              isPending={signingOut}
              isDisabled={!signupSearch}
            >
              {t("web-ui:organization.invitation.switchAccount")}
            </Button>
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
