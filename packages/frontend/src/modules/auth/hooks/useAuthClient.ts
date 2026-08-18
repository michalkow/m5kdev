import { useContext } from "react";
import type { M5KAuthClient } from "../auth.client";
import { authProviderContext } from "../auth.context";
import { getAuthClient } from "../auth.lib";

export function useAuthClient(): M5KAuthClient {
  return useContext(authProviderContext).authClient ?? getAuthClient();
}
