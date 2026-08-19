import type { WorkflowStatus } from "@m5kdev/commons/modules/workflow/workflow.constants";
import type { AppRouter } from "@starter-app/server/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useTRPC } from "@/utils/trpc";

type WorkflowListOutput = inferRouterOutputs<AppRouter>["workflow"]["list"];
type WorkflowRunRow = WorkflowListOutput[number];

const OPEN_STATUSES: ReadonlySet<WorkflowStatus> = new Set(["queued", "running"]);

interface WorkflowsRouteState {
  readonly rows: WorkflowRunRow[];
  readonly isLoading: boolean;
  readonly isFetching: boolean;
  readonly isTriggering: boolean;
  readonly trigger: () => void;
}

export function useWorkflowsRoute(): WorkflowsRouteState {
  const { t } = useTranslation("starter-app");
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const listQuery = useQuery(
    trpc.workflow.list.queryOptions(
      {},
      {
        refetchInterval: (query) => {
          const rows = query.state.data ?? [];
          return rows.some((row) => OPEN_STATUSES.has(row.status)) ? 750 : false;
        },
      }
    )
  );

  const invalidateList = async (): Promise<void> => {
    await queryClient.invalidateQueries(trpc.workflow.list.queryFilter());
  };

  const runMutation = useMutation(
    trpc.demoWorkflow.run.mutationOptions({
      onSuccess: async () => {
        toast.success(t("workflows.toast.triggered"));
        await invalidateList();
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : String(error));
      },
    })
  );

  return {
    rows: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    isFetching: listQuery.isFetching,
    isTriggering: runMutation.isPending,
    trigger: () => {
      void runMutation.mutateAsync().catch(() => undefined);
    },
  };
}
