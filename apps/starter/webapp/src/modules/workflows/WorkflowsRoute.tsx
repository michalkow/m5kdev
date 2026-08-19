import { Button, Card, Chip, EmptyState, Skeleton } from "@heroui/react";
import type { WorkflowStatus } from "@m5kdev/commons/modules/workflow/workflow.constants";
import { PlayIcon, WorkflowIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWorkflowsRoute } from "./hooks/useWorkflowsRoute";

function statusColor(status: WorkflowStatus): "success" | "danger" | "warning" | "default" {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "running") return "warning";
  return "default";
}

function formatTimestamp(value: Date | string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function WorkflowsRoute() {
  const { t } = useTranslation("starter-app");
  const workflows = useWorkflowsRoute();

  return (
    <div className="p-4 grid gap-6" data-testid="workflows-route">
      <Card>
        <Card.Header className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("workflows.hero.eyebrow")}
          </p>
          <Card.Title>{t("workflows.hero.title")}</Card.Title>
          <Card.Description>{t("workflows.hero.body")}</Card.Description>
        </Card.Header>
        <Card.Content className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              isDisabled={workflows.isTriggering}
              data-testid="workflow-trigger"
              onPress={() => workflows.trigger()}
            >
              <span className="inline-flex items-center gap-2">
                <PlayIcon className="h-4 w-4" />
                {t("workflows.hero.run")}
              </span>
            </Button>
            <Chip variant="soft" color="default">
              {workflows.isFetching ? t("workflows.hero.syncing") : t("workflows.hero.synced")}
            </Chip>
          </div>
        </Card.Content>
      </Card>

      {workflows.isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : workflows.rows.length === 0 ? (
        <EmptyState className="flex flex-col items-center gap-4 py-10 text-center">
          <WorkflowIcon className="size-6 text-muted" />
          <div className="grid gap-2">
            <p className="text-lg font-semibold">{t("workflows.empty.title")}</p>
            <p className="max-w-xl text-sm text-muted">{t("workflows.empty.body")}</p>
          </div>
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {workflows.rows.map((row) => (
            <Card key={row.jobId} data-testid="workflow-run">
              <Card.Header className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1">
                  <Card.Title>{row.jobName}</Card.Title>
                  <Card.Description>
                    {t("workflows.columns.id")}: {row.jobId}
                  </Card.Description>
                </div>
                <Chip
                  size="sm"
                  variant="soft"
                  color={statusColor(row.status)}
                  data-testid="workflow-run-status"
                >
                  {t(`workflows.status.${row.status}`)}
                </Chip>
              </Card.Header>
              <Card.Footer className="text-sm text-muted">
                {t("workflows.columns.updated")}: {formatTimestamp(row.updatedAt)}
              </Card.Footer>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
