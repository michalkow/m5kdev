import i18n from "i18next";
import { Fragment, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
  if (!options?.disableCookieCache) return undefined;
  return { query: { disableCookieCache: true } };
}

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
      <Fragment key={i18nLanguage}>{children}</Fragment>
    </authProviderContext.Provider>
  );
}
