import i18n from "i18next";
import { Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppConfigContext } from "../../app/components/AppConfigProvider";
import { syncI18nLocale } from "../../app/utils/locale";
import {
  type AuthSession,
  authProviderContext,
  type RegisterSessionOptions,
} from "../auth.context";
import { type AuthClient, configureAuthClient } from "../auth.lib";

type Session = AuthSession;

function sessionQuery(options?: RegisterSessionOptions):
  | {
      query: { disableCookieCache: true };
    }
  | undefined {
  if (!options?.disableCookieCache && !options?.signIn) return undefined;
  return { query: { disableCookieCache: true } };
}

export function AuthProvider({
  authClient,
  baseURL,
  children,
  loader,
  onSession,
  onSignIn,
}: {
  authClient?: AuthClient;
  baseURL?: string;
  children: React.ReactNode;
  loader?: React.ReactNode;
  onSession?: (session: Session | null) => void;
  /** A fresh successful sign-in, distinct from loading or refreshing a session. */
  onSignIn?: (session: NonNullable<Session>) => void | Promise<void>;
}) {
  const appConfig = useContext(AppConfigContext);
  const resolvedAuthClient = useMemo(
    () => configureAuthClient({ baseURL: baseURL ?? appConfig?.serverUrl, client: authClient }),
    [authClient, appConfig?.serverUrl, baseURL]
  );
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const notifiedSignInSessions = useRef(new Set<string>());
  const signInHandler = useRef(onSignIn);
  useEffect(() => {
    signInHandler.current = onSignIn;
  }, [onSignIn]);
  const [i18nLanguage, setI18nLanguage] = useState(() => i18n.language);

  const registerSession = useCallback(
    (onSuccess?: () => void, options?: RegisterSessionOptions) => {
      return resolvedAuthClient
        .getSession(sessionQuery(options))
        .then(({ data: nextSession }) => {
          setIsLoading(false);
          setSession(nextSession);
          const userLocale = (nextSession?.user as { locale?: string | null } | undefined)?.locale;
          if (userLocale) {
            void syncI18nLocale(userLocale);
          }
          onSession?.(nextSession);
          if (
            options?.signIn &&
            nextSession &&
            (options.signIn === true ||
              nextSession.session.id !== options.signIn.previousSessionId) &&
            !notifiedSignInSessions.current.has(nextSession.session.id)
          ) {
            notifiedSignInSessions.current.add(nextSession.session.id);
            try {
              void Promise.resolve(signInHandler.current?.(nextSession)).catch((error) => {
                console.error("Sign-in callback failed:", error);
              });
            } catch (error) {
              console.error("Sign-in callback failed:", error);
            }
          }
          onSuccess?.();
        })
        .catch((error) => {
          console.error("Failed to get session:", error);
          setIsLoading(false);
          setSession((current) => current);
        });
    },
    [onSession, resolvedAuthClient]
  );

  useEffect(() => {
    registerSession();
  }, [registerSession]);

  useEffect(() => {
    const onLanguageChanged = (language: string): void => {
      // Defer remount so mutate onSuccess (toast) can finish first.
      setTimeout(() => {
        setI18nLanguage(language);
      }, 0);
    };
    i18n.on("languageChanged", onLanguageChanged);
    return () => {
      i18n.off("languageChanged", onLanguageChanged);
    };
  }, []);

  const signOut = useCallback(() => {
    return resolvedAuthClient.signOut().then(() => {
      setSession(null);
      onSession?.(null);
    });
  }, [onSession, resolvedAuthClient]);

  // Show loading screen while checking authentication status
  if (isLoading) {
    return loader ? loader : null;
  }

  return (
    <authProviderContext.Provider
      value={{
        authClient: resolvedAuthClient,
        isLoading,
        hasSignInHandler: !!onSignIn,
        data: session,
        signOut,
        registerSession,
      }}
    >
      <Fragment key={i18nLanguage}>{children}</Fragment>
    </authProviderContext.Provider>
  );
}
