import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { ok } from "neverthrow";
import { BaseTableRepository } from "../base/base.repository";
import * as connect from "./connect.db";
import type { ConnectListInputSchema } from "./connect.dto";

const schema = { ...connect };
type Schema = typeof schema;
type Orm = LibSQLDatabase<Schema>;

export type ConnectRow = InferSelectModel<Schema["connect"]>;
export type ConnectInsert = InferInsertModel<Schema["connect"]>;

export class ConnectRepository extends BaseTableRepository<Orm, Schema, Record<string, never>, Schema["connect"]> {
  async list(data: ConnectListInputSchema & { userId: string }, tx?: Orm) {
    const db = tx ?? this.orm;
    const { ConditionBuilder } = this.helpers;
    const conditions = new ConditionBuilder();
    if (data.providers) conditions.push(inArray(this.schema.connect.provider, data.providers));
    if (data.inactive) conditions.push(isNull(this.schema.connect.revokedAt));
    conditions.push(eq(this.schema.connect.userId, data.userId));

    const rowsResult = await this.throwableQuery(() =>
      db.select().from(this.schema.connect).where(conditions.join())
    );
    if (rowsResult.isErr()) return rowsResult;
    return ok(rowsResult.value);
  }

  async upsert(data: ConnectInsert, tx?: Orm) {
    const db = tx ?? this.orm;

    const existingResult = await this.throwableQuery(() =>
      db
        .select()
        .from(this.schema.connect)
        .where(
          and(
            eq(this.schema.connect.userId, data.userId),
            eq(this.schema.connect.provider, data.provider),
            eq(this.schema.connect.providerAccountId, data.providerAccountId)
          )
        )
        .limit(1)
    );
    if (existingResult.isErr()) return existingResult;
    const [existing] = existingResult.value;

    if (existing) {
      const updatedResult = await this.throwableQuery(() =>
        db
          .update(this.schema.connect)
          .set({
            ...data,
            updatedAt: new Date(),
            lastRefreshedAt: new Date(),
          })
          .where(eq(this.schema.connect.id, existing.id))
          .returning()
      );
      if (updatedResult.isErr()) return updatedResult;
      const [updated] = updatedResult.value;
      return ok(updated);
    }

    const createdResult = await this.throwableQuery(() =>
      db.insert(this.schema.connect).values(data).returning()
    );
    if (createdResult.isErr()) return createdResult;
    const [created] = createdResult.value;
    if (!created) return this.error("UNPROCESSABLE_CONTENT");
    return ok(created);
  }
}
