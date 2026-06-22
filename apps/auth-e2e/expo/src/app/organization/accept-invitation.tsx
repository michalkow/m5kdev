import { useAuthClient } from "@m5kdev/frontend/modules/auth/hooks/useAuthClient";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { type Href, Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { LoadingScreen } from "../../components/LoadingScreen";
import { trpcClient } from "../../lib/trpc";

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function AcceptInvitationScreen() {
  const authClient = useAuthClient();
  const { data: session, registerSession } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const invitationId = singleParam(params.id);
  const [errorPath, setErrorPath] = useState<string | null>(null);

  const signupPath = useMemo(() => {
    if (!invitationId) return null;
    return trpcClient.auth.readInvitation
      .query({ id: invitationId })
      .then((invitation) => {
        const search = new URLSearchParams({
          invitation: invitationId,
          email: invitation.email,
        });
        return `/signup?${search.toString()}`;
      })
      .catch(() => "/signup");
  }, [invitationId]);

  useEffect(() => {
    let cancelled = false;

    if (!invitationId) {
      setErrorPath("/signup");
      return;
    }

    if (!session) {
      signupPath?.then((path) => {
        if (!cancelled) router.replace(path as Href);
      });
      return;
    }

    authClient.organization
      .acceptInvitation({ invitationId })
      .then(async ({ data, error }) => {
        if (error) {
          throw new Error(error.message ?? "Unable to accept invitation");
        }

        const organizationId =
          (data as { invitation?: { organizationId?: string } | null } | null)?.invitation
            ?.organizationId ?? null;

        if (organizationId) {
          const activeResult = await authClient.organization.setActive({ organizationId });
          if (activeResult.error) {
            throw new Error(activeResult.error.message ?? "Unable to activate organization");
          }
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
  }, [authClient, invitationId, registerSession, router, session, signupPath]);

  if (errorPath) {
    return <Redirect href={errorPath as Href} />;
  }

  return <LoadingScreen />;
}
