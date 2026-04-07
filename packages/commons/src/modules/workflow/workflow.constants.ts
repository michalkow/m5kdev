export const WORKFLOW_STATUSES = ["queued", "running", "completed", "failed"] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

/** @deprecated Use WORKFLOW_STATUSES instead. */
export const WORFLOW_STATUSES = WORKFLOW_STATUSES;
