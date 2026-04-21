import { BaseModule, type TableMap } from "../base/base.module";
import { PdfService } from "./pdf.service";

type PdfModuleDeps = never;
type PdfModuleTables = TableMap;
type PdfModuleRepositories = {};
type PdfModuleServices = {
  pdf: PdfService;
};
type PdfModuleRouters = never;

export class PdfModule extends BaseModule<
  PdfModuleDeps,
  PdfModuleTables,
  PdfModuleRepositories,
  PdfModuleServices,
  PdfModuleRouters
> {
  readonly id = "pdf";

  override services(_: unknown) {
    return {
      pdf: new PdfService(undefined as never, undefined as never),
    };
  }
}
