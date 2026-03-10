import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import type { createTRPCContext } from "@trpc/tanstack-react-query";

export type UseBackendTRPC = ReturnType<typeof createTRPCContext<BackendTRPCRouter>>["useTRPC"];
