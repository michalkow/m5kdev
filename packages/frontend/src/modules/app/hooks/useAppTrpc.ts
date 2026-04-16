import type { TRPCClient } from "@trpc/client";
import type { AnyTRPCRouter } from "@trpc/server";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { trpcContext } from "../components/AppTrpcQueryProvider";

export function useAppTRPC<TRouter extends AnyTRPCRouter = AnyTRPCRouter>() {
  return trpcContext.useTRPC() as TRPCOptionsProxy<TRouter>;
}

export function useAppTRPCClient<TRouter extends AnyTRPCRouter = AnyTRPCRouter>() {
  return trpcContext.useTRPCClient() as TRPCClient<TRouter>;
}
