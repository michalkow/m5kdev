import { z } from "zod";

export const SERVER_EVENT_CHANGES = ["created", "updated", "deleted"] as const;

export const serverEventEnvelopeSchema = z.object({
  resource: z.string().min(1),
  id: z.string().min(1),
  change: z.enum(SERVER_EVENT_CHANGES),
  organizationId: z.string().nullable(),
  snapshot: z.unknown().optional(),
});

export type ServerEventChange = (typeof SERVER_EVENT_CHANGES)[number];
export type ServerEventEnvelope = z.infer<typeof serverEventEnvelopeSchema>;
