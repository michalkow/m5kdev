import { defineBackendModule } from "../../app";
import { PdfService } from "./pdf.service";

export function createPdfBackendModule(options: { id?: string } = {}) {
  return defineBackendModule({
    id: options.id ?? "pdf",
    services: () => ({
      pdf: new PdfService(undefined as never, undefined as never),
    }),
  });
}
