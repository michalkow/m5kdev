import {
  supportCreateCaseSchema,
  supportListSchema,
  supportSendMessageSchema,
} from "@m5kdev/commons/modules/support/support.schema";
import { z } from "zod";
import { handleTRPCResult, type TRPCMethods } from "../../utils/trpc";
import { supportSchemas } from "./support.dto";
import type { SupportService } from "./support.service";

export function createSupportTRPC({ router, userProcedure }: TRPCMethods, service: SupportService) {
  return router({
    updateCase: userProcedure
      .input(supportSchemas.input.updateCase)
      .output(supportSchemas.output.case)
      .mutation(async ({ input, ctx }) => handleTRPCResult(await service.updateCase(input, ctx))),
    getCatalog: userProcedure
      .input(z.object({}))
      .output(supportSchemas.output.catalog)
      .query(async ({ input, ctx }) => handleTRPCResult(await service.getCatalog(input, ctx))),
    saveCatalog: userProcedure
      .input(supportSchemas.input.catalog)
      .output(supportSchemas.output.catalog)
      .mutation(async ({ input, ctx }) => handleTRPCResult(await service.saveCatalog(input, ctx))),
    setTags: userProcedure
      .input(supportSchemas.input.setTags)
      .output(supportSchemas.output.case)
      .mutation(async ({ input, ctx }) => handleTRPCResult(await service.setTags(input, ctx))),
    initiateAttachment: userProcedure
      .input(supportSchemas.input.upload)
      .output(supportSchemas.output.upload)
      .mutation(async ({ input, ctx }) =>
        handleTRPCResult(await service.initiateAttachment(input, ctx))
      ),
    downloadAttachment: userProcedure
      .input(supportSchemas.input.download)
      .output(supportSchemas.output.download)
      .mutation(async ({ input, ctx }) =>
        handleTRPCResult(await service.downloadAttachment(input, ctx))
      ),
    redactMessage: userProcedure
      .input(supportSchemas.input.redact)
      .output(supportSchemas.output.redaction)
      .mutation(async ({ input, ctx }) =>
        handleTRPCResult(await service.redactMessage(input, ctx))
      ),
    getSettings: userProcedure
      .input(z.object({}))
      .output(supportSchemas.output.settings)
      .query(async ({ input, ctx }) => handleTRPCResult(await service.getSettings(input, ctx))),
    saveSettings: userProcedure
      .input(supportSchemas.input.saveSettings)
      .output(supportSchemas.output.settings)
      .mutation(async ({ input, ctx }) => handleTRPCResult(await service.saveSettings(input, ctx))),
    setWorkingLocale: userProcedure
      .input(supportSchemas.input.workingLocale)
      .output(supportSchemas.output.locale)
      .mutation(async ({ input, ctx }) =>
        handleTRPCResult(await service.setWorkingLocale(input, ctx))
      ),
    setLanguage: userProcedure
      .input(supportSchemas.input.language)
      .output(supportSchemas.output.case)
      .mutation(async ({ input, ctx }) => handleTRPCResult(await service.setLanguage(input, ctx))),
    requestTranslation: userProcedure
      .input(supportSchemas.input.translate)
      .output(supportSchemas.output.work)
      .mutation(async ({ input, ctx }) =>
        handleTRPCResult(await service.requestTranslation(input, ctx))
      ),
    controlMessage: userProcedure
      .input(supportSchemas.input.controlMessage)
      .output(supportSchemas.output.message)
      .mutation(async ({ input, ctx }) =>
        handleTRPCResult(await service.controlMessage(input, ctx))
      ),
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
