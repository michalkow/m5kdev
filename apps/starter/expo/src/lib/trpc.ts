import { useAppTRPC, useAppTRPCClient } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import type { AppRouter } from "@starter-app/server/types";

export function useTRPC() {
  return useAppTRPC<AppRouter>();
}

export function useTRPCClient() {
  return useAppTRPCClient<AppRouter>();
}
