import { useContext } from "react";
import { authProviderContext } from "../auth.context";
import { getAuthClient } from "../auth.lib";

export function useAuthClient() {
  return useContext(authProviderContext).authClient ?? getAuthClient();
}
