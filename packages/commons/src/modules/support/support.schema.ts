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
  visibility: z.enum(["public", "internal"]).default("public"),
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
  .object({
    limit: z.number().int().min(1).max(100).default(30),
    search: z.string().trim().max(200).optional(),
    status: z.enum(["open", "resolved"]).optional(),
    waitingOn: z.enum(["support", "user", "external"]).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    assignedUserId: z.string().nullable().optional(),
    tagId: z.string().optional(),
    active: z.boolean().optional(),
  })
  .default({ limit: 30 });
export type SupportCreateCase = z.infer<typeof supportCreateCaseSchema>;
export type SupportSendMessage = z.infer<typeof supportSendMessageSchema>;

export const supportSyncSchema = z.object({
  id: z.string().min(1),
  cursor: z.string().max(512).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export const supportReadSchema = z.object({
  id: z.string().min(1),
  throughSequence: z.number().int().min(0),
});

export const supportHistorySchema = supportCaseIdSchema.extend({
  beforeSequence: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const supportUpdateCaseSchema = supportCaseIdSchema.extend({
  expectedVersion: z.number().int().min(1),
  status: z.enum(["open", "resolved"]).optional(),
  waitingOn: z.enum(["support", "user", "external"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assignedUserId: z.string().nullable().optional(),
  snoozedUntil: z.coerce.date().nullable().optional(),
  handling: z.enum(["human", "ai"]).optional(),
});
export const supportCatalogSchema = z.object({
  kind: z.enum(["tag", "reply"]),
  id: z.string().optional(),
  name: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(20000).optional(),
  remove: z.boolean().default(false),
});
export const supportSetTagsSchema = supportCaseIdSchema.extend({
  expectedVersion: z.number().int().min(1),
  tagIds: z.array(z.string().min(1)).max(30),
});
