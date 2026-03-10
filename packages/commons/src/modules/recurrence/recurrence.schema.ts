import { z } from "zod";

// Reusable schemas for JSON-by-* fields (number or number[])
const numberOrNumberArraySchema = z.union([z.number(), z.array(z.number())]).nullish();

export const recurrenceMetadataSchema = z.record(z.string(), z.unknown()).nullish();

export const recurrenceSchema = z.object({
  id: z.string(),
  userId: z.string().nullish(),
  organizationId: z.string().nullish(),
  teamId: z.string().nullish(),
  name: z.string().nullish(),
  kind: z.string().nullish(),
  enabled: z.boolean(),
  metadata: recurrenceMetadataSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const recurrenceRulesSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  recurrenceId: z.string().nullish(),
  freq: z.number(),
  dtstart: z.date().nullish(),
  interval: z.number(),
  wkst: z.number().nullish(),
  count: z.number().nullish(),
  until: z.date().nullish(),
  tzid: z.string().nullish(),
  bysetpos: numberOrNumberArraySchema,
  bymonth: numberOrNumberArraySchema,
  bymonthday: numberOrNumberArraySchema,
  byyearday: numberOrNumberArraySchema,
  byweekno: numberOrNumberArraySchema,
  byweekday: numberOrNumberArraySchema,
  byhour: numberOrNumberArraySchema,
  byminute: numberOrNumberArraySchema,
  bysecond: numberOrNumberArraySchema,
});
export const updateRecurrenceRulesSchema = recurrenceRulesSchema.omit({
  createdAt: true,
  updatedAt: true,
  recurrenceId: true,
});

export const createRecurrenceSchema = z.object({
  name: z.string(),
  kind: z.string(),
  enabled: z.boolean(),
  metadata: recurrenceMetadataSchema,
  recurrenceRules: z.array(updateRecurrenceRulesSchema.omit({ id: true })),
});

export const updateRecurrenceSchema = z.object({
  name: z.string().optional(),
  kind: z.string().optional(),
  enabled: z.boolean().optional(),
  metadata: recurrenceMetadataSchema,
});

export const deleteRecurrenceSchema = z.object({
  id: z.string(),
});

export const deleteRecurrenceRulesSchema = z.object({
  id: z.string(),
});

export type RecurrenceSchema = z.infer<typeof recurrenceSchema>;
export type RecurrenceRulesSchema = z.infer<typeof recurrenceRulesSchema>;
export type CreateRecurrenceSchema = z.infer<typeof createRecurrenceSchema>;
export type UpdateRecurrenceSchema = z.infer<typeof updateRecurrenceSchema>;
export type UpdateRecurrenceRulesSchema = z.infer<typeof updateRecurrenceRulesSchema>;
export type DeleteRecurrenceSchema = z.infer<typeof deleteRecurrenceSchema>;
export type DeleteRecurrenceRulesSchema = z.infer<typeof deleteRecurrenceRulesSchema>;
