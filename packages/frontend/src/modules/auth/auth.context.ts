import { createContext } from "react";
import type { M5KAuthClient } from "./auth.client";

export type AuthSession = ReturnType<M5KAuthClient["useSession"]>["data"];

export interface RegisterSessionOptions {
  disableCookieCache?: boolean;
}

export const authProviderContext = createContext<{
  authClient: M5KAuthClient;
  isLoading: boolean;
  data: AuthSession | null;
  signOut: () => void;
  registerSession: (onSuccess?: () => void, options?: RegisterSessionOptions) => Promise<void>;
}>({
  authClient: null as unknown as M5KAuthClient,
  isLoading: true,
  data: null,
  signOut: () => {},
  registerSession: async () => {},
});
