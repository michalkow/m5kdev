import { err, ok } from "neverthrow";
import { PDFParse } from "pdf-parse";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseService } from "../base/base.service";

export class PdfService extends BaseService<never, never> {
  async convertToText(url: string): ServerResultAsync<string> {
    const parser = new PDFParse({ url });
    const result = await this.throwablePromise(() => parser.getText());
    if (result.isErr()) return err(result.error);
    return ok(result.value.text);
  }
}
