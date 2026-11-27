import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { Navigate, Route } from "react-router";
import { SupportPanel } from "./SupportPanel";

function SupportAdminPage() {
  const session = useSession();
  if (session.isLoading) return null;
  return session.data?.user.role === "admin" ? <SupportPanel admin /> : <Navigate to="/" replace />;
}
export function SupportAdminRouter() {
  return <Route path="/admin/support" element={<SupportAdminPage />} />;
}
