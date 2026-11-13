import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import { consumeSignInRedirect } from "../utils/signInRedirect";

export function useAuthPublicSignInCallback(): void {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { registerSession } = useSession();
  const navigate = useNavigate();
  const startedAttempt = useRef<string | null>(null);

  useEffect(() => {
    if (!attemptId || startedAttempt.current === attemptId) return;
    startedAttempt.current = attemptId;
    // Consume synchronously, before async work or Strict Mode can replay the return.
    const attempt = consumeSignInRedirect(attemptId);
    if (!attempt) {
      void navigate("/", { replace: true });
      return;
    }
    const finish = () => {
      void navigate(attempt.returnTo, { replace: true });
    };
    void registerSession(undefined, {
      signIn: { previousSessionId: attempt.previousSessionId },
    }).then(finish, finish);
  }, [attemptId, navigate, registerSession]);
}
