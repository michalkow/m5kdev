import type { ServerResultAsync } from "@m5kdev/backend/base/base.dto";
import { BaseService } from "@m5kdev/backend/base/base.service";
import { err, ok } from "neverthrow";
import { PDFParse } from "pdf-parse";

export class PdfService extends BaseService<never, never> {
  async convertToText(url: string): ServerResultAsync<string> {
    const parser = new PDFParse({ url });
    const result = await this.throwablePromise(() => parser.getText());
    if (result.isErr()) return err(result.error);
    return ok(result.value.text);
  }
}
