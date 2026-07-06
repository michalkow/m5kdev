import { useContext } from "react";
import { authProviderContext } from "../auth.context";
import type { M5KAuthClient } from "../auth.client";
import { getAuthClient } from "../auth.lib";

export function useAuthClient(): M5KAuthClient {
  return useContext(authProviderContext).authClient ?? getAuthClient();
}
