import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import type { AppRouter } from "{{PACKAGE_SCOPE}}/server/types";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
export function useTRPC(): TRPCOptionsProxy<AppRouter> {
  return useAppTRPC<AppRouter>();
}
