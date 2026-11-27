import {
  supportCreateCaseSchema,
  supportListSchema,
  supportSendMessageSchema,
} from "@m5kdev/commons/modules/support/support.schema";
import { handleTRPCResult, type TRPCMethods } from "../../utils/trpc";
import { supportSchemas } from "./support.dto";
import type { SupportService } from "./support.service";

export function createSupportTRPC({ router, userProcedure }: TRPCMethods, service: SupportService) {
  return router({
    createCase: userProcedure
      .input(supportCreateCaseSchema)
      .output(supportSchemas.output.case)
      .mutation(async ({ input, ctx }) => handleTRPCResult(await service.createCase(input, ctx))),
    getCase: userProcedure
      .input(supportSchemas.input.history)
      .output(supportSchemas.output.transcript)
      .query(async ({ input, ctx }) => handleTRPCResult(await service.getCase(input, ctx))),
    listCases: userProcedure
      .input(supportListSchema)
      .output(supportSchemas.output.list)
      .query(async ({ input, ctx }) => handleTRPCResult(await service.listCases(input, ctx))),
    sync: userProcedure
      .input(supportSchemas.input.sync)
      .output(supportSchemas.output.sync)
      .query(async ({ input, ctx }) => handleTRPCResult(await service.sync(input, ctx))),
    markRead: userProcedure
      .input(supportSchemas.input.markRead)
      .output(supportSchemas.output.markRead)
      .mutation(async ({ input, ctx }) => handleTRPCResult(await service.markRead(input, ctx))),
    sendMessage: userProcedure
      .input(supportSendMessageSchema)
      .output(supportSchemas.output.message)
      .mutation(async ({ input, ctx }) => handleTRPCResult(await service.sendMessage(input, ctx))),
  });
}
export function createSupportAppTRPC(methods: TRPCMethods, service: SupportService) {
  return methods.router({ support: createSupportTRPC(methods, service) });
}
export type SupportAppRouter = ReturnType<typeof createSupportAppTRPC>;
