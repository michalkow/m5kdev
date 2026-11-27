import {
  supportCalendarSchema,
  supportCaseIdSchema,
  supportCatalogSchema,
  supportCreateCaseSchema,
  supportDownloadSchema,
  supportHistorySchema,
  supportLanguageSchema,
  supportListSchema,
  supportMessageControlSchema,
  supportOverviewSchema,
  supportRateSchema,
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
    rate: supportRateSchema,
    overview: supportOverviewSchema,
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
    metrics: z.object({
      id: z.string(),
      firstResponseMs: z.number().nullable(),
      firstHumanResponseMs: z.number().nullable(),
      handoffWaitMs: z.array(z.number()),
      outstandingSince: z.date().nullable(),
      activeUnresolvedMs: z.number(),
      lifetimeResolutionElapsedMs: z.number().nullable(),
      hasUserExchange: z.boolean(),
      cycles: z.array(
        z.object({
          number: z.number(),
          startedAt: z.date(),
          resolvedAt: z.date().nullable(),
          eligible: z.boolean(),
          handledBy: z.enum(["human", "ai"]).nullable(),
        })
      ),
    }),
    overview: z.object({
      from: z.date(),
      to: z.date(),
      sampleCases: z.number(),
      partial: z.boolean(),
      open: z.number(),
      unassigned: z.number(),
      waiting: z.object({ support: z.number(), user: z.number(), external: z.number() }),
      oldestUnanswered: z.array(z.object({ id: z.string(), subject: z.string(), since: z.date() })),
      firstHumanResponse: z.object({
        medianMs: z.number().nullable(),
        p95Ms: z.number().nullable(),
        samples: z.number(),
        unanswered: z.number(),
      }),
      handoffWait: z.object({
        medianMs: z.number().nullable(),
        p95Ms: z.number().nullable(),
        samples: z.number(),
      }),
      csat: z.object({
        human: z.object({ samples: z.number(), positive: z.number().nullable() }),
        ai: z.object({ samples: z.number(), positive: z.number().nullable() }),
      }),
    }),
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
    feedback: z.object({ cycle: z.number(), score: z.number() }),
    availability: z.object({
      version: z.number(),
      replyExpectation: z.string(),
      calendar: supportCalendarSchema.nullable(),
      openNow: z.boolean().nullable(),
      csatEnabled: z.boolean(),
      languages: z.array(z.string()),
    }),
    transcript: z.object({
      case: caseOutput,
      messages: z.array(messageOutput),
      feedback: z.object({
        eligible: z.boolean(),
        score: z.number().nullable(),
        cycle: z.number(),
        handledBy: z.enum(["human", "ai"]).nullable(),
      }),
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
