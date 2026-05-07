import { Route } from "react-router";
import type { z } from "zod";
import { AuthUserLogoutRoute } from "./AuthUserLogoutRoute";
import { AuthUserPreferences, type AuthUserPreferencesProps } from "./AuthUserPreferences";

export function AuthUserRouter<S extends z.ZodObject<z.ZodRawShape>>(
  props: AuthUserPreferencesProps<S>
) {
  return (
    <>
      <Route path="/user/preferences" element={<AuthUserPreferences {...props} />} />
      <Route path="/logout" element={<AuthUserLogoutRoute />} />
    </>
  );
}
