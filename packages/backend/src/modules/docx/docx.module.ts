import { defineBackendModule } from "../../app";
import { DocxService } from "./docx.service";

export function createDocxBackendModule(options: { id?: string } = {}) {
  return defineBackendModule({
    id: options.id ?? "docx",
    services: () => ({
      docx: new DocxService(undefined as never, undefined as never),
    }),
  });
}
