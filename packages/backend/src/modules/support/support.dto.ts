import {
  supportCaseIdSchema,
  supportCreateCaseSchema,
  supportListSchema,
  supportSendMessageSchema,
} from "@m5kdev/commons/modules/support/support.schema";
import { z } from "zod";
import { createZodSchemas } from "../../base/base.dto";
import { supportCases, supportMessages } from "./support.db";

const caseOutput = createZodSchemas(supportCases).output.single.omit({
  clientId: true,
  requestHash: true,
  initiatorUserId: true,
});
const messageOutput = createZodSchemas(supportMessages).output.single.omit({
  clientId: true,
  requestHash: true,
});
export const supportSchemas = {
  input: {
    createCase: supportCreateCaseSchema,
    read: supportCaseIdSchema,
    send: supportSendMessageSchema,
    list: supportListSchema,
  },
  output: {
    case: caseOutput,
    message: messageOutput,
    transcript: z.object({ case: caseOutput, messages: z.array(messageOutput) }),
    list: z.array(caseOutput),
  },
};
