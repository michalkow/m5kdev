import { z } from "zod";

export const supportCreateCaseSchema = z.object({
  clientId: z.string().min(1).max(128),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
  userId: z.string().min(1).optional(),
});
export const supportCaseIdSchema = z.object({ id: z.string().min(1) });
export const supportSendMessageSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1).max(128),
  body: z.string().trim().min(1).max(20000),
});
export const supportCaseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  subject: z.string(),
  organizationId: z.string().nullable(),
  origin: z.enum(["user", "admin"]),
  version: z.number().int(),
  lastSequence: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export const supportMessageSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  sequence: z.number().int(),
  authorUserId: z.string().nullable(),
  authorKind: z.enum(["user", "admin", "ai", "system"]),
  body: z.string(),
  visibility: z.enum(["public", "internal"]),
  acceptedAt: z.coerce.date(),
  publishedAt: z.coerce.date().nullable(),
});
export const supportTranscriptSchema = z.object({
  case: supportCaseSchema,
  messages: z.array(supportMessageSchema),
});
export const supportListSchema = z
  .object({ limit: z.number().int().min(1).max(100).default(30) })
  .default({ limit: 30 });
export type SupportCreateCase = z.infer<typeof supportCreateCaseSchema>;
export type SupportSendMessage = z.infer<typeof supportSendMessageSchema>;
