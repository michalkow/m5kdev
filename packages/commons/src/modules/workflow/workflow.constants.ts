export const WORFLOW_STATUSES = ["queued", "running", "completed", "failed"] as const;
export type WorkflowStatus = (typeof WORFLOW_STATUSES)[number];
