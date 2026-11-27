import { Route } from "react-router";
import { SupportPanel } from "./SupportPanel";

export function SupportAdminRouter() {
  return <Route path="/admin/support" element={<SupportPanel admin />} />;
}
