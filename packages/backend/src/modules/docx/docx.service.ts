import mammoth from "mammoth";
import { err, ok } from "neverthrow";
import TurndownService from "turndown";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseService } from "../base/base.service";

export class DocxService extends BaseService<never, never> {
  async convertToMarkdown(buffer: Buffer): ServerResultAsync<string> {
    const turndown = new TurndownService();
    const htmlResult = await this.throwablePromise(() => mammoth.convertToHtml({ buffer }));
    if (htmlResult.isErr()) return err(htmlResult.error);
    const html = htmlResult.value.value;

    const markdownResult = this.throwable(() => ok(turndown.turndown(html)));
    if (markdownResult.isErr()) return err(markdownResult.error);

    return ok(markdownResult.value);
  }
}
