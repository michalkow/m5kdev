import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { err, ok } from "neverthrow";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseTableRepository } from "../base/base.repository";
import { WEBHOOK_STATUS_ENUM } from "./webhook.constants";
import { webhook } from "./webhook.db";

const schema = { webhook };
type Schema = typeof schema;
type Orm = NodePgDatabase<Schema>;

export class WebhookRepository extends BaseTableRepository<
  Orm,
  Schema,
  Record<string, never>,
  Schema["webhook"]
> {
  async completed(id: string, payload: unknown, tx?: Orm): ServerResultAsync<void> {
    const webhook = await this.findById(id, tx);
    if (webhook.isErr()) return err(webhook.error);
    if (!webhook.value) return this.error("NOT_FOUND");
    if (webhook.value.status !== WEBHOOK_STATUS_ENUM.WAITING) {
      return this.error("CONFLICT", "Inbound callback is not waiting");
    }

    const updateResult = await this.update(
      {
        id,
        status: WEBHOOK_STATUS_ENUM.COMPLETED,
        payload,
      },
      tx
    );
    if (updateResult.isErr()) return err(updateResult.error);

    return ok();
  }

  async timeout(id: string, tx?: Orm): ServerResultAsync<void> {
    const webhook = await this.findById(id, tx);
    if (webhook.isErr()) return err(webhook.error);
    if (!webhook.value) return this.error("NOT_FOUND");

    const updateResult = await this.update(
      {
        id,
        status: WEBHOOK_STATUS_ENUM.TIMEOUT,
        error: `Timeout of ${webhook.value.timeoutSec} seconds reached`,
      },
      tx
    );
    if (updateResult.isErr()) return err(updateResult.error);

    return ok();
  }

  async registerError(
    id: string,
    status: "ERROR_CALLBACK" | "ERROR_DATA",
    error: string,
    tx?: Orm
  ): ServerResultAsync<void> {
    const webhook = await this.findById(id, tx);
    if (webhook.isErr()) return err(webhook.error);
    if (!webhook.value) return this.error("NOT_FOUND");

    const updateResult = await this.update(
      {
        id,
        status,
        error,
      },
      tx
    );
    if (updateResult.isErr()) return err(updateResult.error);

    return ok();
  }
}
