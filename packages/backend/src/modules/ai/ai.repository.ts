import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { eq, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { ok } from "neverthrow";
import * as ai from "#modules/ai/ai.db";
import type { ServerResultAsync } from "#modules/base/base.dto";
import { BaseTableRepository } from "#modules/base/base.repository";

const schema = { ...ai };
type Schema = typeof schema;
type Orm = LibSQLDatabase<Schema>;

export type AiUsageRow = InferSelectModel<Schema["aiUsage"]>;
export type AiUsageInsert = InferInsertModel<Schema["aiUsage"]>;

export interface CreateAiUsageInput {
  userId?: string;
  teamId?: string;
  organizationId?: string;
  feature: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cost?: number;
  traceId?: string;
  metadata?: unknown;
}

export class AiUsageRepository extends BaseTableRepository<
  Orm,
  Schema,
  Record<string, never>,
  Schema["aiUsage"]
> {
  getUsage(
    userId: string
  ): ServerResultAsync<Pick<AiUsageRow, "inputTokens" | "outputTokens" | "totalTokens" | "cost">> {
    return this.throwableAsync(async () => {
      const [usage] = await this.orm
        .select({
          inputTokens: sql<number>`SUM(${this.table.inputTokens})`,
          outputTokens: sql<number>`SUM(${this.table.outputTokens})`,
          totalTokens: sql<number>`SUM(${this.table.totalTokens})`,
          cost: sql<number>`SUM(${this.table.cost})`,
        })
        .from(this.table)
        .where(eq(this.table.userId, userId));
      return ok(usage);
    });
  }
}
