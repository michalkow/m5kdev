import { useProtectedRoute } from "../hooks/useProtectedRoute";

interface ProtectedRoutesProps {
  children: React.ReactNode;
}

export function ProtectedRoutes({ children }: ProtectedRoutesProps) {
  const hasSession = useProtectedRoute();

  if (!hasSession) {
    return null;
  }

  return <>{children}</>;
}
