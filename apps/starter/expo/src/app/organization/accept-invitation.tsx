import { useAuthClient } from "@m5kdev/frontend/modules/auth/hooks/useAuthClient";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { type Href, Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { LoadingScreen } from "../../components/LoadingScreen";
import { useTRPCClient } from "../../lib/trpc";

function singleParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default function AcceptInvitationScreen() {
  const authClient = useAuthClient();
  const trpcClient = useTRPCClient();
  const { data: session, registerSession } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string | string[];
    experienceFlow?: string | string[];
  }>();
  const invitationId = singleParam(params.id);
  const experienceFlow = singleParam(params.experienceFlow);
  const invalidContinuation = Array.isArray(params.id) || Array.isArray(params.experienceFlow);
  const [errorPath, setErrorPath] = useState<string | null>(null);

  const signupPath = useMemo(() => {
    if (!invitationId || invalidContinuation) return null;
    return trpcClient.auth.readInvitation
      .query({ id: invitationId, experienceFlow })
      .then((invitation) => {
        const search = new URLSearchParams({
          invitation: invitationId,
          email: invitation.email,
        });
        if (experienceFlow) search.set("experienceFlow", experienceFlow);
        return `/signup?${search.toString()}`;
      })
      .catch(() => "/signup");
  }, [invitationId, experienceFlow, invalidContinuation, trpcClient]);

  useEffect(() => {
    let cancelled = false;

    if (!invitationId || invalidContinuation) {
      setErrorPath("/signup");
      return;
    }

    if (!session) {
      signupPath?.then((path) => {
        if (!cancelled) router.replace(path as Href);
      });
      return;
    }

    trpcClient.auth.acceptOrganizationInvitation
      .mutate({ id: invitationId, experienceFlow })
      .then(async (accepted) => {
        const activeResult = await authClient.organization.setActive({
          organizationId: accepted.organizationId,
        });
        if (activeResult.error) {
          throw new Error(activeResult.error.message ?? "Unable to activate organization");
        }

        if (!cancelled) {
          registerSession(() => router.replace("/posts"));
        }
      })
      .catch(() => {
        if (!cancelled) setErrorPath("/signup");
      });

    return () => {
      cancelled = true;
    };
  }, [
    authClient,
    invitationId,
    experienceFlow,
    invalidContinuation,
    registerSession,
    router,
    session,
    signupPath,
    trpcClient,
  ]);

  if (errorPath) {
    return <Redirect href={errorPath as Href} />;
  }

  return <LoadingScreen />;
}
