import { handleTRPCResult, type TRPCMethods } from "../../utils/trpc";
import { fileSchemas } from "./file.dto";
import type { FileService } from "./file.service";

export function createFileTRPC(
  { router, organizationProcedure: procedure }: TRPCMethods,
  fileService: FileService
) {
  return router({
    list: procedure
      .input(fileSchemas.input.list)
      .output(fileSchemas.output.list)
      .query(async ({ ctx, input }) => handleTRPCResult(await fileService.list(input ?? {}, ctx))),
  });
}
