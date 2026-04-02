import { ok } from "neverthrow";
import { PDFParse } from "pdf-parse";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseService } from "../base/base.service";

export class PdfService extends BaseService<never, never> {
  async convertToText(url: string): ServerResultAsync<string> {
    return this.throwableAsync(async () => {
      const parser = new PDFParse({ url });

      const result = await parser.getText();

      return ok(result.text);
    });
  }
}
