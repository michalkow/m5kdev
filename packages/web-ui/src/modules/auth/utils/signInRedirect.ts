const STORAGE_PREFIX = "m5kdev:sign-in:";
const ATTEMPT_LIFETIME_MS = 15 * 60 * 1000;

interface SignInRedirect {
  previousSessionId: string | null;
  returnTo: string;
  expiresAt: number;
}

function localDestination({ returnTo, appUrl }: { returnTo: string; appUrl: string }): string {
  const app = new URL(appUrl);
  const destination = new URL(returnTo, app);
  if (destination.origin !== app.origin) return "/";
  return `${destination.pathname}${destination.search}${destination.hash}`;
}

/** Browser-only correlation; never store credentials or session tokens. */
export function createSignInRedirect({
  appUrl,
  returnTo,
  previousSessionId,
}: {
  appUrl: string;
  returnTo: string;
  previousSessionId: string | null;
}): { callbackURL: string; clear: () => void } | null {
  try {
    if (new URL(appUrl).origin !== window.location.origin) return null;
    const attemptId = crypto.randomUUID();
    const key = `${STORAGE_PREFIX}${attemptId}`;
    const attempt: SignInRedirect = {
      previousSessionId,
      returnTo: localDestination({ returnTo, appUrl }),
      expiresAt: Date.now() + ATTEMPT_LIFETIME_MS,
    };
    sessionStorage.setItem(key, JSON.stringify(attempt));
    return {
      callbackURL: new URL(`/auth/sign-in/${attemptId}`, appUrl).href,
      clear: () => {
        try {
          sessionStorage.removeItem(key);
        } catch {
          // Storage restrictions must not break authentication.
        }
      },
    };
  } catch {
    // Without browser storage, retain the original redirect without recording.
    return null;
  }
}

export function consumeSignInRedirect(attemptId: string): SignInRedirect | null {
  try {
    const key = `${STORAGE_PREFIX}${attemptId}`;
    const stored = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    if (!stored) return null;
    const attempt: unknown = JSON.parse(stored);
    if (
      !attempt ||
      typeof attempt !== "object" ||
      !("previousSessionId" in attempt) ||
      !(attempt.previousSessionId === null || typeof attempt.previousSessionId === "string") ||
      !("returnTo" in attempt) ||
      typeof attempt.returnTo !== "string" ||
      !("expiresAt" in attempt) ||
      typeof attempt.expiresAt !== "number" ||
      attempt.expiresAt <= Date.now()
    )
      return null;
    return {
      previousSessionId: attempt.previousSessionId,
      returnTo: localDestination({ returnTo: attempt.returnTo, appUrl: window.location.origin }),
      expiresAt: attempt.expiresAt,
    };
  } catch {
    return null;
  }
}
