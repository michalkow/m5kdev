import { createM5KAuthClient } from "./auth.client";

export { createM5KAuthClient };
export type { M5KAuthClient as AuthClient } from "./auth.client";

export let authClient = createM5KAuthClient();

export function configureAuthClient({
  baseURL,
  client,
}: {
  baseURL?: string;
  client?: typeof authClient;
} = {}) {
  authClient = client ?? createM5KAuthClient(baseURL);
  return authClient;
}

export function getAuthClient() {
  return authClient;
}
