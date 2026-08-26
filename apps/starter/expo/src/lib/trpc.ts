import { transformer } from "@m5kdev/commons/utils/trpc";
import { useAppTRPC, useAppTRPCClient } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import type { AppRouter } from "@starter-app/server/types";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { serverUrl } from "../config";

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${serverUrl}/trpc`,
      fetch(url, options) {
        return fetch(url, {
          ...options,
          body: options?.body ? (options.body as BodyInit | null | undefined) : undefined,
          credentials: "include",
        });
      },
      transformer,
    }),
  ],
});

export function useTRPC() {
  return useAppTRPC<AppRouter>();
}

export function useTRPCClient() {
  return useAppTRPCClient<AppRouter>();
}
