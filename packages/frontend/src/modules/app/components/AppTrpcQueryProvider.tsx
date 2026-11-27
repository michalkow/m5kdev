import { transformer } from "@m5kdev/commons/utils/trpc";
import { QueryClient, type QueryClientConfig, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";
import type { AnyTRPCRouter } from "@trpc/server";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { type ReactNode, useEffect, useState } from "react";
import { useSession } from "../../auth/hooks/useSession";
import { useAppConfig } from "../hooks/useAppConfig";

type TrpcConfig = Parameters<typeof createTRPCClient<AnyTRPCRouter>>[0];

const defaultQueryClientConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
    },
  },
};

let browserQueryClient: { scope: string; client: QueryClient } | undefined;
const clientScopes = new WeakMap<QueryClient, string>();

function makeQueryClient(config?: QueryClientConfig) {
  return new QueryClient(config ?? defaultQueryClientConfig);
}

function getQueryClient(scope: string, config?: QueryClientConfig) {
  if (typeof window === "undefined" || config) {
    return makeQueryClient(config);
  }

  if (!browserQueryClient || browserQueryClient.scope !== scope)
    browserQueryClient = { scope, client: makeQueryClient(config) };
  return browserQueryClient.client;
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

type AppTrpcQueryProviderProps = {
  children: ReactNode;
  queryClient?: QueryClient;
  queryClientConfig?: QueryClientConfig;
  trpcClient?: TRPCClient<AnyTRPCRouter>;
  trpcConfig?: TrpcConfig;
  /** Override only for a custom identity flow; change it whenever its authorization scope changes. */
  cacheScope?: string;
};
export function AppTrpcQueryProvider(props: AppTrpcQueryProviderProps) {
  const { data } = useSession();
  const scope =
    props.cacheScope ??
    JSON.stringify([data?.user.id ?? null, data?.session.id ?? null, data?.user.role ?? null]);
  return <IdentityQueryProvider key={scope} {...props} scope={scope} />;
}
function IdentityQueryProvider({
  children,
  queryClient,
  queryClientConfig,
  trpcClient,
  trpcConfig,
  scope,
}: AppTrpcQueryProviderProps & { scope: string }) {
  const { serverUrl } = useAppConfig();
  const [resolvedQueryClient] = useState(
    () => queryClient ?? getQueryClient(scope, queryClientConfig)
  );
  const [resolvedTrpcClient] = useState(
    () => trpcClient ?? createTRPCClientFromConfig(serverUrl, trpcConfig)
  );
  const [ready, setReady] = useState(
    () => !clientScopes.has(resolvedQueryClient) || clientScopes.get(resolvedQueryClient) === scope
  );
  useEffect(() => {
    const prior = clientScopes.get(resolvedQueryClient);
    if (prior !== undefined && prior !== scope) {
      void resolvedQueryClient.cancelQueries();
      resolvedQueryClient.clear();
    }
    clientScopes.set(resolvedQueryClient, scope);
    setReady(true);
    return () => {
      void resolvedQueryClient.cancelQueries();
    };
  }, [resolvedQueryClient, scope]);
  const { TRPCProvider: BaseTRPCProvider } = trpcContext;
  if (!ready) return null;

  return (
    <QueryClientProvider client={resolvedQueryClient}>
      <BaseTRPCProvider queryClient={resolvedQueryClient} trpcClient={resolvedTrpcClient}>
        {children}
      </BaseTRPCProvider>
    </QueryClientProvider>
  );
}
