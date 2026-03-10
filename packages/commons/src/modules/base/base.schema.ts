import { z } from "zod";

export const uuidSchema = z.object({
  id: z.uuid(),
});

export const uuidManySchema = z.object({
  ids: z.array(z.uuid()),
});

export const scheduleOutputSchema = z.object({
  jobId: z.string(),
});

export const scheduleManyOutputSchema = z.object({
  jobIds: z.array(z.string()),
});

export const deleteOutputSchema = uuidSchema;
export const deleteManyOutputSchema = uuidManySchema;

export type UuidSchema = z.infer<typeof uuidSchema>;
export type UuidManySchema = z.infer<typeof uuidManySchema>;
export type ScheduleOutputSchema = z.infer<typeof scheduleOutputSchema>;
export type ScheduleManyOutputSchema = z.infer<typeof scheduleManyOutputSchema>;
export type DeleteOutputSchema = z.infer<typeof deleteOutputSchema>;
export type DeleteManyInputSchema = z.infer<typeof deleteManyOutputSchema>;
