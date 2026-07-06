import { createM5KAuthClient, type M5KAuthClient } from "./auth.client";

export { createM5KAuthClient };
export type { M5KAuthClient as AuthClient } from "./auth.client";

export let authClient: M5KAuthClient = createM5KAuthClient();

export function configureAuthClient({
  baseURL,
  client,
}: {
  baseURL?: string;
  client?: M5KAuthClient;
} = {}): M5KAuthClient {
  authClient = client ?? createM5KAuthClient(baseURL);
  return authClient;
}

export function getAuthClient(): M5KAuthClient {
  return authClient;
}
