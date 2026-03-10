import { z } from "zod";
import { WORFLOW_STATUSES } from "./workflow.constants";

export const workflowSelectSchema = z.object({
  id: z.uuid(),
  userId: z.string().nullable(),
  jobId: z.string(),
  jobName: z.string(),
  queueName: z.string(),
  tags: z.array(z.string()).nullable(),
  input: z.unknown(),
  output: z.unknown(),
  status: z.enum(WORFLOW_STATUSES),
  error: z.string().nullable(),
  retries: z.number(),
  finishedAt: z.date().nullable(),
  processedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const workflowReadInputSchema = z.object({
  jobId: z.string(),
});

export const workflowListInputSchema = z.object({
  status: z.enum(WORFLOW_STATUSES).array().optional(),
  jobName: z.string().optional(),
});

export const workflowTriggerOutputSchema = z.object({
  jobId: z.string(),
});

export const workflowTriggerManyOutputSchema = z.object({
  jobIds: z.array(z.string()),
});

export const workflowReadOutputSchema = workflowSelectSchema;
export const workflowListOutputSchema = workflowSelectSchema.array();

export type WorkflowSelectSchema = z.infer<typeof workflowSelectSchema>;
export type WorkflowReadInputSchema = z.infer<typeof workflowReadInputSchema>;
export type WorkflowListInputSchema = z.infer<typeof workflowListInputSchema>;
export type WorkflowReadOutputSchema = z.infer<typeof workflowReadOutputSchema>;
export type WorkflowListOutputSchema = z.infer<typeof workflowListOutputSchema>;
export type WorkflowTriggerOutputSchema = z.infer<typeof workflowTriggerOutputSchema>;
export type WorkflowTriggerManyOutputSchema = z.infer<typeof workflowTriggerManyOutputSchema>;
