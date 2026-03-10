import type { z } from "zod";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseService } from "../base/base.service";
import type { WebhookService } from "../webhook/webhook.service";
import type { ClayRepository } from "./clay.repository";

type ClayTable = {
  name?: string;
  tableId?: string;
  viewId?: string;
  webhookUrl: string;
  schema?: z.ZodAny;
  timeoutInSeconds?: number;
};

export class ClayService<K extends string> extends BaseService<
  { clay: ClayRepository },
  { webhook: WebhookService }
> {
  private tables: Record<K, ClayTable>;
  constructor(
    repositories: { clay: ClayRepository },
    services: { webhook: WebhookService },
    tables: Record<K, ClayTable>
  ) {
    super(repositories, services);
    this.tables = tables;
  }

  async waitForResponse<T>(
    webhookUrl: string,
    row: Record<string, unknown>,
    timeoutInSeconds?: number
  ): ServerResultAsync<T> {
    return await this.service.webhook.waitForRequest<T>((url) => {
      return this.repository.clay.sendToWebhook(webhookUrl, row, url);
    }, timeoutInSeconds);
  }

  async sendToTable(
    table: K,
    row: Record<string, unknown>,
    timeoutInSeconds?: number
  ): ServerResultAsync<
    z.infer<
      (typeof this.tables)[K]["schema"] extends z.ZodAny
        ? z.infer<(typeof this.tables)[K]["schema"]>
        : unknown
    >
  > {
    const tableData = this.tables[table];
    if (!tableData) return this.error("NOT_FOUND", `Table ${table} not found`);
    const response = await this.waitForResponse<z.infer<typeof tableData.schema>>(
      tableData.webhookUrl,
      row,
      tableData.timeoutInSeconds || timeoutInSeconds
    );

    return response;
  }
}
