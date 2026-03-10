import { usePostHog } from "posthog-js/react";
import { createContext, useCallback, useEffect, useState } from "react";
import { authClient } from "../auth.lib";

type Session = ReturnType<typeof authClient.useSession>["data"];

function isImpersonatedSession(session: Session | null): boolean {
  const sessionData = session?.session as { impersonatedBy?: string | null } | undefined;
  return Boolean(sessionData?.impersonatedBy);
}

export const authProviderContext = createContext<{
  isLoading: boolean;
  data: Session | null;
  signOut: () => void;
  registerSession: (onSuccess: () => void) => void;
}>({
  isLoading: true,
  data: null,
  signOut: () => {},
  registerSession: () => {},
});

export function AuthProvider({
  children,
  loader,
  onSession,
}: {
  children: React.ReactNode;
  loader?: React.ReactNode;
  onSession?: (session: Session | null) => void;
}) {
  const posthog = usePostHog();
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  const registerSession = useCallback(
    (onSuccess?: () => void) => {
      authClient
        .getSession()
        .then(({ data: nextSession }) => {
          setIsLoading(false);
          setSession(nextSession);
          onSession?.(nextSession);

          if (isImpersonatedSession(nextSession)) {
            posthog.opt_out_capturing();
            posthog.reset();
            onSuccess?.();
            return;
          }

          posthog.opt_in_capturing();

          if (nextSession?.user) {
            posthog.identify(nextSession.user.id, {
              email: nextSession.user.email,
              name: nextSession.user.name,
              createdAt: nextSession.user.createdAt,
              updatedAt: nextSession.user.updatedAt,
              role: nextSession.user.role,
              image: nextSession.user.image,
              preferences: nextSession.user.preferences,
              onboarding: nextSession.user.onboarding,
              flags: nextSession.user.flags,
            });
          } else {
            posthog.reset();
          }

          onSuccess?.();
        })
        .catch((error) => {
          console.error("Failed to get session:", error);
          setIsLoading(false);
          setSession(null);
        });
    },
    [onSession, posthog]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies(registerSession): registerSession is a callback
  useEffect(() => {
    registerSession();
  }, []);

  const signOut = useCallback(() => {
    authClient.signOut().then(() => {
      posthog.reset();
      posthog.opt_in_capturing();
      setSession(null);
    });
  }, [posthog]);

  // Show loading screen while checking authentication status
  if (isLoading) {
    return loader ? loader : "Loading...";
  }

  return (
    <authProviderContext.Provider value={{ isLoading, data: session, signOut, registerSession }}>
      {children}
    </authProviderContext.Provider>
  );
}
