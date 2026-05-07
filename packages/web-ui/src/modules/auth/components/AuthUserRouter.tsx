import { Route } from "react-router";
import type { z } from "zod";
import { UserPreferences, type UserPreferencesProps } from "./UserPreferences";

export function AuthUserRouter<S extends z.ZodObject<z.ZodRawShape>>(
  props: UserPreferencesProps<S>
) {
  return <Route path="/user/preferences" element={<UserPreferences {...props} />} />;
}
