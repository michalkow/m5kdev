import mammoth from "mammoth";
import TurndownService from "turndown";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseService } from "../base/base.service";

export class DocxService extends BaseService<never, never> {
  async convertToMarkdown(buffer: Buffer): ServerResultAsync<string> {
    return this.throwableAsync(async () => {
      const turndown = new TurndownService();
      const { value: html } = await mammoth.convertToHtml({ buffer });
      const markdown = turndown.turndown(html);
      return markdown;
    });
  }
}
