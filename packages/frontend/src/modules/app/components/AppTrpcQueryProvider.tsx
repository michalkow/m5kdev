import { transformer } from "@m5kdev/commons/utils/trpc";
import { QueryClient, type QueryClientConfig, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";
import type { AnyTRPCRouter } from "@trpc/server";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { type ReactNode, useState } from "react";
import { useAppConfig } from "../hooks/useAppConfig";

type TrpcConfig = Parameters<typeof createTRPCClient<AnyTRPCRouter>>[0];

const defaultQueryClientConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
    },
  },
};

let browserQueryClient: QueryClient | undefined;

function makeQueryClient(config?: QueryClientConfig) {
  return new QueryClient(config ?? defaultQueryClientConfig);
}

function getQueryClient(config?: QueryClientConfig) {
  if (typeof window === "undefined" || config) {
    return makeQueryClient(config);
  }

  browserQueryClient ??= makeQueryClient(config);
  return browserQueryClient;
}

function createTRPCClientFromConfig(url: string, config?: TrpcConfig) {
  return createTRPCClient<AnyTRPCRouter>(
    config ?? {
      links: [
        httpBatchLink({
          url: `${url}/trpc`,
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
    }
  );
}

export const trpcContext: ReturnType<typeof createTRPCContext<AnyTRPCRouter>> =
  createTRPCContext<AnyTRPCRouter>();

export function AppTrpcQueryProvider({
  children,
  queryClient,
  queryClientConfig,
  trpcClient,
  trpcConfig,
}: {
  queryClient?: QueryClient;
  queryClientConfig?: QueryClientConfig;
  trpcConfig?: Parameters<typeof createTRPCClient<AnyTRPCRouter>>[0];
  children: ReactNode;
  trpcClient?: TRPCClient<AnyTRPCRouter>;
}) {
  const { serverUrl } = useAppConfig();
  const [resolvedQueryClient] = useState(() => queryClient ?? getQueryClient(queryClientConfig));
  const [resolvedTrpcClient] = useState(
    () => trpcClient ?? createTRPCClientFromConfig(serverUrl, trpcConfig)
  );
  const { TRPCProvider: BaseTRPCProvider } = trpcContext;

  return (
    <QueryClientProvider client={resolvedQueryClient}>
      <BaseTRPCProvider queryClient={resolvedQueryClient} trpcClient={resolvedTrpcClient}>
        {children}
      </BaseTRPCProvider>
    </QueryClientProvider>
  );
}
