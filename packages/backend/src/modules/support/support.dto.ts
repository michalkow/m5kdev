import {
  supportCaseIdSchema,
  supportCreateCaseSchema,
  supportHistorySchema,
  supportListSchema,
  supportReadSchema,
  supportSendMessageSchema,
  supportSyncSchema,
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
  .extend({ unreadCount: z.number().int().min(0).default(0) });
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
  },
  output: {
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
    markRead: z.object({ sequence: z.number().int() }),
  },
};
