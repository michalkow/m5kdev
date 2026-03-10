import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { err, ok } from "neverthrow";
import type { ServerResultAsync } from "#modules/base/base.dto";
import { BaseTableRepository } from "#modules/base/base.repository";
import { WEBHOOK_STATUS_ENUM } from "./webhook.constants";
import { webhook } from "./webhook.db";

const schema = { webhook };
type Schema = typeof schema;
type Orm = LibSQLDatabase<Schema>;

export class WebhookRepository extends BaseTableRepository<Orm, Schema, Record<string, never>, Schema["webhook"]> {
  async completed(id: string, payload: unknown, tx?: Orm): ServerResultAsync<void> {
    return this.throwableAsync(async () => {
      const webhook = await this.findById(id, tx);
      if (webhook.isErr()) return err(webhook.error);
      if (!webhook.value) return this.error("NOT_FOUND");
      await this.update(
        {
          id,
          status: WEBHOOK_STATUS_ENUM.COMPLETED,
          payload: JSON.stringify(payload),
        },
        tx
      );
      return ok();
    });
  }

  async timeout(id: string, tx?: Orm): ServerResultAsync<void> {
    return this.throwableAsync(async () => {
      const webhook = await this.findById(id, tx);
      if (webhook.isErr()) return err(webhook.error);
      if (!webhook.value) return this.error("NOT_FOUND");
      await this.update(
        {
          id,
          status: WEBHOOK_STATUS_ENUM.TIMEOUT,
          error: `Timeout of ${webhook.value.timeoutSec} seconds reached`,
        },
        tx
      );
      return ok();
    });
  }

  async registerError(
    id: string,
    status: "ERROR_CALLBACK" | "ERROR_DATA",
    error: string,
    tx?: Orm
  ): ServerResultAsync<void> {
    return this.throwableAsync(async () => {
      const webhook = await this.findById(id, tx);
      if (webhook.isErr()) return err(webhook.error);
      if (!webhook.value) return this.error("NOT_FOUND");
      await this.update(
        {
          id,
          status,
          error,
        },
        tx
      );
      return ok();
    });
  }
}
