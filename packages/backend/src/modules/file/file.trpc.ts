import { handleTRPCResult, type TRPCMethods } from "../../utils/trpc";
import { fileSchemas } from "./file.dto";
import type { FileService } from "./file.service";

export function createFileTRPC(
  { router, organizationProcedure, userProcedure }: TRPCMethods,
  fileService: FileService
) {
  return router({
    list: organizationProcedure
      .input(fileSchemas.input.list)
      .output(fileSchemas.output.list)
      .query(async ({ ctx, input }) => handleTRPCResult(await fileService.list(input ?? {}, ctx))),

    get: organizationProcedure
      .input(fileSchemas.input.get)
      .output(fileSchemas.output.single)
      .query(async ({ ctx, input }) => handleTRPCResult(await fileService.get(input, ctx))),

    getDownloadUrl: organizationProcedure
      .input(fileSchemas.input.getDownloadUrl)
      .output(fileSchemas.output.downloadUrl)
      .query(async ({ ctx, input }) =>
        handleTRPCResult(await fileService.getDownloadUrl(input, ctx))
      ),

    initiate: organizationProcedure
      .input(fileSchemas.input.initiate)
      .output(fileSchemas.output.initiate)
      .mutation(async ({ ctx, input }) =>
        handleTRPCResult(await fileService.initiate(input, ctx))
      ),

    finalize: organizationProcedure
      .input(fileSchemas.input.finalize)
      .output(fileSchemas.output.finalize)
      .mutation(async ({ ctx, input }) =>
        handleTRPCResult(await fileService.finalize(input, ctx))
      ),

    user: router({
      list: userProcedure
        .input(fileSchemas.input.list)
        .output(fileSchemas.output.list)
        .query(async ({ ctx, input }) => handleTRPCResult(await fileService.list(input ?? {}, ctx))),
      get: userProcedure
        .input(fileSchemas.input.get)
        .output(fileSchemas.output.single)
        .query(async ({ ctx, input }) => handleTRPCResult(await fileService.get(input, ctx))),
      getDownloadUrl: userProcedure
        .input(fileSchemas.input.getDownloadUrl)
        .output(fileSchemas.output.downloadUrl)
        .query(async ({ ctx, input }) =>
          handleTRPCResult(await fileService.getDownloadUrl(input, ctx))
        ),
      initiate: userProcedure
        .input(fileSchemas.input.initiate)
        .output(fileSchemas.output.initiate)
        .mutation(async ({ ctx, input }) =>
          handleTRPCResult(await fileService.initiate(input, ctx))
        ),
      finalize: userProcedure
        .input(fileSchemas.input.finalize)
        .output(fileSchemas.output.finalize)
        .mutation(async ({ ctx, input }) =>
          handleTRPCResult(await fileService.finalize(input, ctx))
        ),
    }),
  });
}
