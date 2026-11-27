import { z } from "zod";

export const supportCreateCaseSchema = z.object({
  clientId: z.string().min(1).max(128),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
  userId: z.string().min(1).optional(),
  uiLocale: z.string().min(2).max(35).optional(),
  experienceId: z.string().max(100).optional(),
});
export const supportCaseIdSchema = z.object({ id: z.string().min(1) });
export const supportSendMessageSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1).max(128),
  body: z.string().trim().min(1).max(20000),
  visibility: z.enum(["public", "internal"]).default("public"),
  attachmentIds: z.array(z.string().min(1)).max(50).default([]),
  locale: z.string().min(2).max(35).optional(),
  preview: z.boolean().default(false),
});
export const supportListSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(30),
    cursor: z.string().max(512).optional(),
    search: z.string().trim().max(200).optional(),
    status: z.enum(["open", "resolved"]).optional(),
    waitingOn: z.enum(["support", "user", "external"]).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    assignedUserId: z.string().nullable().optional(),
    tagId: z.string().optional(),
    active: z.boolean().optional(),
  })
  .default({ limit: 30 });
export type SupportCreateCase = z.input<typeof supportCreateCaseSchema>;
export type SupportSendMessage = z.input<typeof supportSendMessageSchema>;

export const supportSyncSchema = z.object({
  id: z.string().min(1),
  cursor: z.string().max(512).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export const supportReadSchema = z.object({
  id: z.string().min(1),
  throughSequence: z.number().int().min(0),
  messageIds: z.array(z.string().min(1)).max(100),
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

export const supportUploadSchema = supportCaseIdSchema.extend({
  originalName: z.string().min(1).max(255),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"]),
  sizeBytes: z.number().int().min(0),
});
export const supportDownloadSchema = supportCaseIdSchema.extend({ fileId: z.string().min(1) });
export const supportRedactSchema = supportCaseIdSchema.extend({
  messageId: z.string().min(1),
  reason: z.string().trim().min(1).max(1000),
});

export const supportBudgetSchema = z.object({
  monthlyCalls: z.number().int().min(1).max(1000000),
  dailyUserCalls: z.number().int().min(1).max(10000),
  maxInputCharacters: z.number().int().min(1).max(100000),
  maxOutputCharacters: z.number().int().min(1).max(100000),
  concurrency: z.number().int().min(1).max(20),
  attempts: z.number().int().min(1).max(3),
  timeoutMs: z.number().int().min(100).max(60000),
});
const feature = z.object({ enabled: z.boolean(), budget: supportBudgetSchema.optional() });
export const supportCalendarSchema = z.object({
  timeZone: z.string().min(1).max(100),
  weekly: z
    .array(
      z.object({
        day: z.number().int().min(0).max(6),
        opens: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
        closes: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
      })
    )
    .max(28),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(366),
});
export const supportSettingsSchema = z.object({
  nativeLocales: z.array(z.string().min(2).max(35)).min(1).max(50),
  fallbackLocale: z.string().min(2).max(35),
  translation: feature,
  ai: feature,
  csatEnabled: z.boolean().default(false),
  calendar: supportCalendarSchema.nullable().default(null),
  replyExpectation: z.string().max(500).default(""),
});
export const supportSaveSettingsSchema = supportSettingsSchema.extend({
  expectedVersion: z.number().int().min(0),
});
export const supportLanguageSchema = supportCaseIdSchema.extend({
  locale: z.string().min(2).max(35).nullable(),
});
export const supportWorkingLocaleSchema = z.object({ locale: z.string().min(2).max(35) });
export const supportMessageControlSchema = supportCaseIdSchema.extend({
  messageId: z.string().min(1),
  action: z.enum(["retry", "send-original", "publish-preview"]),
});
export const supportTranslateSchema = supportCaseIdSchema.extend({
  messageId: z.string().min(1),
  locale: z.string().min(2).max(35),
});

export const supportDocumentationEntrySchema = z.object({
  id: z.string().min(1).max(200),
  locale: z.string().min(2).max(35),
  experience: z.string().min(1).max(100),
  url: z.url().max(2000),
  title: z.string().min(1).max(300),
  text: z.string().min(1).max(100000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const supportManifestSchema = z.object({
  schemaVersion: z.literal(1),
  version: z.string().min(1).max(128),
  applicationVersion: z.string().min(1).max(100),
  generatedAt: z.iso.datetime(),
  entries: z.array(supportDocumentationEntrySchema).min(1).max(2000),
});
export const supportStageDocumentationSchema = z.object({ manifest: supportManifestSchema });
export const supportWithdrawDocumentationSchema = z.object({ version: z.string().min(1).max(128) });

export const supportRateSchema = supportCaseIdSchema.extend({
  cycle: z.number().int().min(1),
  score: z.number().int().min(-1).max(1),
});
export const supportOverviewSchema = z.object({ since: z.coerce.date().optional() });
