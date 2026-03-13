import type { AppRouter } from "{{PACKAGE_SCOPE}}/server/types";
import { transformer } from "@m5kdev/commons/utils/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { type ReactNode, useState } from "react";
import { TRPCProvider } from "@/utils/trpc";

let browserQueryClient: QueryClient | undefined;

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
    },
  });
}

function getQueryClient() {
  if (typeof window === "undefined") {
    return createQueryClient();
  }

  if (!browserQueryClient) {
    browserQueryClient = createQueryClient();
  }

  return browserQueryClient;
}

export function TrpcQueryProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${import.meta.env.VITE_SERVER_URL}/trpc`,
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
    })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
      <ReactQueryDevtools client={queryClient} />
    </QueryClientProvider>
  );
}
