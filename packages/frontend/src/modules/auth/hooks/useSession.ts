import { useContext } from "react";
import { authProviderContext } from "../components/AuthProvider";

export function useSession() {
  return useContext(authProviderContext);
}
