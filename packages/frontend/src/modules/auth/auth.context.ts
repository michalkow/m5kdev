import { createContext } from "react";
import type { M5KAuthClient } from "./auth.client";

export type AuthSession = ReturnType<M5KAuthClient["useSession"]>["data"];

export const authProviderContext = createContext<{
  authClient: M5KAuthClient;
  isLoading: boolean;
  data: AuthSession | null;
  signOut: () => void;
  registerSession: (onSuccess?: () => void) => void;
}>({
  authClient: null as unknown as M5KAuthClient,
  isLoading: true,
  data: null,
  signOut: () => {},
  registerSession: () => {},
});
