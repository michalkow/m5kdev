import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppConfigContext } from "../../app/components/AppConfigProvider";
import { type AuthSession, authProviderContext } from "../auth.context";
import { type AuthClient, configureAuthClient } from "../auth.lib";

type Session = AuthSession;

export function AuthProvider({
  authClient,
  baseURL,
  children,
  loader,
  onSession,
}: {
  authClient?: AuthClient;
  baseURL?: string;
  children: React.ReactNode;
  loader?: React.ReactNode;
  onSession?: (session: Session | null) => void;
}) {
  const appConfig = useContext(AppConfigContext);
  const resolvedAuthClient = useMemo(
    () => configureAuthClient({ baseURL: baseURL ?? appConfig?.serverUrl, client: authClient }),
    [authClient, appConfig?.serverUrl, baseURL]
  );
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  const registerSession = useCallback(
    (onSuccess?: () => void) => {
      resolvedAuthClient
        .getSession()
        .then(({ data: nextSession }) => {
          setIsLoading(false);
          setSession(nextSession);
          onSession?.(nextSession);
          onSuccess?.();
        })
        .catch((error) => {
          console.error("Failed to get session:", error);
          setIsLoading(false);
          setSession(null);
        });
    },
    [onSession, resolvedAuthClient]
  );

  useEffect(() => {
    registerSession();
  }, [registerSession]);

  const signOut = useCallback(() => {
    resolvedAuthClient.signOut().then(() => {
      setSession(null);
    });
  }, [resolvedAuthClient]);

  // Show loading screen while checking authentication status
  if (isLoading) {
    return loader ? loader : null;
  }

  return (
    <authProviderContext.Provider
      value={{ authClient: resolvedAuthClient, isLoading, data: session, signOut, registerSession }}
    >
      {children}
    </authProviderContext.Provider>
  );
}
