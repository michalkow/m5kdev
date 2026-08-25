// biome-ignore-all assist/source/organizeImports: feature-gated Server event imports stay in marker blocks
import { ServerEventProvider } from "@m5kdev/frontend/modules/app/components/ServerEventProvider";
// m5k:workflows:start
import type { QueryClient } from "@tanstack/react-query";
import { DEMO_WORKFLOW_SERVER_EVENT_RESOURCE } from "@starter-app/shared/modules/demo-workflow/demo-workflow.constants";
// m5k:workflows:end
import type { ReactNode } from "react";
// m5k:workflows:start
import { useTRPC } from "./utils/trpc";
// m5k:workflows:end

type Props = {
  children: ReactNode;
};

/** Kernel SSE for the authenticated session. Workflow handlers are feature-gated. */
export function StarterServerEventProvider({ children }: Props): ReactNode {
  // m5k:workflows:start
  const trpc = useTRPC();
  const invalidateWorkflowList = (queryClient: QueryClient): void => {
    void queryClient.invalidateQueries(trpc.workflow.list.queryFilter());
  };
  // m5k:workflows:end
  return (
    <ServerEventProvider
      // m5k:workflows:start
      handlers={{
        [DEMO_WORKFLOW_SERVER_EVENT_RESOURCE]: (_event, queryClient) => {
          invalidateWorkflowList(queryClient);
        },
      }}
      onReconnect={invalidateWorkflowList}
      // m5k:workflows:end
    >
      {children}
    </ServerEventProvider>
  );
}
