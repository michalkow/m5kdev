import type { ServerEventHandler } from "@m5kdev/frontend";
import type { useTRPC } from "@/utils/trpc";

export function createWorkflowListServerEventHandler(
  trpc: ReturnType<typeof useTRPC>
): ServerEventHandler {
  return (_event, queryClient) => {
    void queryClient.invalidateQueries(trpc.workflow.list.queryFilter());
  };
}
