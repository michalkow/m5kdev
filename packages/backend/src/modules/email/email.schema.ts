import { experienceIdSchema } from "@m5kdev/commons/modules/app/experience.schema";
import { z } from "zod";

/** Trusted event identifiers loaded by the owning server service, never recipient inference. */
export const communicationContextSchema = z
  .object({
    event: z.string().min(1),
    eventId: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
    organizationId: z.string().min(1).optional(),
    resourceId: z.string().min(1).optional(),
  })
  .strict();
export type CommunicationContext = z.infer<typeof communicationContextSchema>;

export const communicationExperienceInputSchema = z
  .object({
    experienceId: experienceIdSchema.optional(),
    context: communicationContextSchema.optional(),
  })
  .strict();
export type CommunicationExperienceInput = z.infer<typeof communicationExperienceInputSchema>;

export type CommunicationPolicy = (
  context: CommunicationContext
) =>
  | z.infer<typeof experienceIdSchema>
  | undefined
  | Promise<z.infer<typeof experienceIdSchema> | undefined>;
