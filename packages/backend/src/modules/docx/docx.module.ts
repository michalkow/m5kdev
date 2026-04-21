import { BaseModule, type TableMap } from "../base/base.module";
import { DocxService } from "./docx.service";

type DocxModuleDeps = never;
type DocxModuleTables = TableMap;
type DocxModuleRepositories = {};
type DocxModuleServices = {
  docx: DocxService;
};
type DocxModuleRouters = never;

export class DocxModule extends BaseModule<
  DocxModuleDeps,
  DocxModuleTables,
  DocxModuleRepositories,
  DocxModuleServices,
  DocxModuleRouters
> {
  readonly id = "docx";

  override services() {
    return {
      docx: new DocxService(),
    };
  }
}
