import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { ok } from "neverthrow";
import type { ServerResultAsync } from "#modules/base/base.dto";
import { BaseTableRepository } from "#modules/base/base.repository";
import * as recurrence from "#modules/recurrence/recurrence.db";

const schema = { ...recurrence };
type Schema = typeof schema;
type Orm = LibSQLDatabase<Schema>;
type RecurrenceInsert = InferInsertModel<Schema["recurrence"]>;
type RecurrenceRulesInsert = InferInsertModel<Schema["recurrenceRules"]>;

/** Rule input for create: rule fields without id, recurrenceId, createdAt, updatedAt */
export type CreateRecurrenceRuleInput = Omit<
  RecurrenceRulesInsert,
  "id" | "recurrenceId" | "createdAt" | "updatedAt"
>;

export interface CreateWithRulesResult {
  recurrence: InferSelectModel<Schema["recurrence"]>;
  rules: InferSelectModel<Schema["recurrenceRules"]>[];
}

export class RecurrenceRepository extends BaseTableRepository<
  Orm,
  Schema,
  Record<string, never>,
  Schema["recurrence"]
> {
  async createWithRules(
    recurrenceData: RecurrenceInsert,
    rulesData: CreateRecurrenceRuleInput[],
    tx?: Orm
  ): ServerResultAsync<CreateWithRulesResult> {
    return this.throwableAsync(async () => {
      const db = tx ?? this.orm;
      const result = await db.transaction(async (trx) => {
        const [createdRecurrence] = await trx
          .insert(this.table)
          .values(recurrenceData)
          .returning();
        if (!createdRecurrence) throw new Error("Failed to create recurrence");

        const rulesWithRecurrenceId: RecurrenceRulesInsert[] = rulesData.map((rule) => ({
          ...rule,
          recurrenceId: createdRecurrence.id,
        }));

        const insertedRules =
          rulesWithRecurrenceId.length > 0
            ? await trx
                .insert(this.schema.recurrenceRules)
                .values(rulesWithRecurrenceId)
                .returning()
            : [];

        return ok({ recurrence: createdRecurrence, rules: insertedRules });
      });
      return result;
    });
  }
}

export class RecurrenceRulesRepository extends BaseTableRepository<
  Orm,
  Schema,
  Record<string, never>,
  Schema["recurrenceRules"]
> {}
