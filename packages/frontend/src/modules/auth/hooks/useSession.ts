import { useContext } from "react";
import { authProviderContext } from "../auth.context";

export function useSession() {
  const { authClient: _authClient, ...session } = useContext(authProviderContext);
  return session;
}
