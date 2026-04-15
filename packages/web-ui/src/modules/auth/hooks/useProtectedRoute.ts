import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

export function useProtectedRoute(loginPath = "login") {
  const { data: session, isLoading } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const path = new URLSearchParams({ returnTo: `${location.pathname}${location.search}` });
  const params = path.toString();

  useEffect(() => {
    if (!session && !isLoading) navigate(`${loginPath}?${params}`, { replace: true });
  }, [session, navigate, params, loginPath, isLoading]);

  return Boolean(session);
}
