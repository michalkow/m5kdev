import {
  supportCaseIdSchema,
  supportCatalogSchema,
  supportCreateCaseSchema,
  supportDownloadSchema,
  supportHistorySchema,
  supportLanguageSchema,
  supportListSchema,
  supportMessageControlSchema,
  supportReadSchema,
  supportRedactSchema,
  supportSaveSettingsSchema,
  supportSendMessageSchema,
  supportSetTagsSchema,
  supportSettingsSchema,
  supportStageDocumentationSchema,
  supportSyncSchema,
  supportTranslateSchema,
  supportUpdateCaseSchema,
  supportUploadSchema,
  supportWithdrawDocumentationSchema,
  supportWorkingLocaleSchema,
} from "@m5kdev/commons/modules/support/support.schema";
import { z } from "zod";
import { createZodSchemas } from "../../base/base.dto";
import { supportCases, supportMessages } from "./support.db";

const caseOutput = createZodSchemas(supportCases)
  .output.single.omit({
    clientId: true,
    requestHash: true,
    initiatorUserId: true,
  })
  .extend({
    unreadCount: z.number().int().min(0).default(0),
    tagIds: z.array(z.string()).default([]),
  });
const messageOutput = createZodSchemas(supportMessages).output.single.omit({
  clientId: true,
  requestHash: true,
});
export const supportSchemas = {
  input: {
    createCase: supportCreateCaseSchema,
    read: supportCaseIdSchema,
    history: supportHistorySchema,
    send: supportSendMessageSchema,
    list: supportListSchema,
    sync: supportSyncSchema,
    markRead: supportReadSchema,
    updateCase: supportUpdateCaseSchema,
    catalog: supportCatalogSchema,
    setTags: supportSetTagsSchema,
    stageDocumentation: supportStageDocumentationSchema,
    withdrawDocumentation: supportWithdrawDocumentationSchema,
    saveSettings: supportSaveSettingsSchema,
    language: supportLanguageSchema,
    workingLocale: supportWorkingLocaleSchema,
    controlMessage: supportMessageControlSchema,
    translate: supportTranslateSchema,
    upload: supportUploadSchema,
    download: supportDownloadSchema,
    redact: supportRedactSchema,
  },
  output: {
    documentation: z.array(
      z.object({
        id: z.string(),
        version: z.string(),
        applicationVersion: z.string(),
        state: z.string(),
        error: z.string().nullable(),
        activatedAt: z.date().nullable(),
      })
    ),
    settings: supportSettingsSchema.extend({
      version: z.number().int(),
      locales: z.array(z.string()),
      workingLocale: z.string(),
    }),
    work: z.object({ id: z.string(), state: z.string() }),
    locale: z.object({ locale: z.string() }),
    upload: z.object({ fileId: z.string(), url: z.string() }),
    download: z.object({ url: z.string(), expiresAt: z.date() }),
    redaction: z.object({ id: z.string(), cleanupPending: z.boolean() }),
    case: caseOutput,
    message: messageOutput,
    transcript: z.object({
      case: caseOutput,
      messages: z.array(messageOutput),
      hasOlder: z.boolean(),
      cursor: z.string(),
    }),
    list: z.array(caseOutput),
    sync: z.object({
      case: caseOutput,
      cursor: z.string(),
      hasMore: z.boolean(),
      messages: z.array(messageOutput),
      changes: z.array(
        z.object({
          sequence: z.number(),
          type: z.string(),
          occurredAt: z.date(),
          data: z.record(z.string(), z.unknown()),
        })
      ),
    }),
    catalog: z.object({
      tags: z.array(z.object({ id: z.string(), name: z.string() })),
      replies: z.array(z.object({ id: z.string(), title: z.string(), body: z.string() })),
    }),
    markRead: z.object({ sequence: z.number().int() }),
  },
};
