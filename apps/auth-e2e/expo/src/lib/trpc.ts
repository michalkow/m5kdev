import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { transformer } from "@m5kdev/commons/utils/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { serverUrl } from "../config";

export const trpcClient = createTRPCClient<BackendTRPCRouter>({
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
