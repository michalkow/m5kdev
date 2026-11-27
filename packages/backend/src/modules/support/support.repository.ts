import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, asc, desc, eq, type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import type { NodePgDatabase, NodePgTransaction } from "drizzle-orm/node-postgres";
import { BaseRepository } from "../../base/base.repository";
import { supportCases, supportEvents, supportMessages } from "./support.db";

const tables = { supportCases, supportMessages, supportEvents };
type Schema = typeof tables;
type Orm = NodePgDatabase<Schema>;
export type SupportTransaction = NodePgTransaction<Schema, ExtractTablesWithRelations<Schema>>;
export type SupportCaseRow = InferSelectModel<typeof supportCases>;
export type SupportMessageRow = InferSelectModel<typeof supportMessages>;

export class SupportRepository extends BaseRepository<Orm, Schema, Record<string, never>> {
  transaction<T>(run: (tx: SupportTransaction) => Promise<T>) {
    return this.throwablePromise(() => this.orm.transaction(run));
  }
  async lockRequest(key: string, tx: SupportTransaction) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }
  async lockCase(id: string, tx: SupportTransaction) {
    const [row] = await tx.select().from(supportCases).where(eq(supportCases.id, id)).for("update");
    return row;
  }
  async findRequest(userId: string, clientId: string, tx: SupportTransaction) {
    const [row] = await tx
      .select()
      .from(supportCases)
      .where(and(eq(supportCases.initiatorUserId, userId), eq(supportCases.clientId, clientId)));
    return row;
  }
  async insertCase(row: InferInsertModel<typeof supportCases>, tx: SupportTransaction) {
    const [created] = await tx.insert(supportCases).values(row).returning();
    return created;
  }
  async findMessage(caseId: string, userId: string, clientId: string, tx: SupportTransaction) {
    const [row] = await tx
      .select()
      .from(supportMessages)
      .where(
        and(
          eq(supportMessages.caseId, caseId),
          eq(supportMessages.authorUserId, userId),
          eq(supportMessages.clientId, clientId)
        )
      );
    return row;
  }
  async append(
    message: InferInsertModel<typeof supportMessages>,
    event: InferInsertModel<typeof supportEvents>,
    tx: SupportTransaction
  ) {
    const [row] = await tx.insert(supportMessages).values(message).returning();
    await tx.insert(supportEvents).values(event);
    await tx
      .update(supportCases)
      .set({ lastSequence: message.sequence, version: event.sequence, updatedAt: event.occurredAt })
      .where(eq(supportCases.id, message.caseId));
    return row;
  }
  findById(id: string) {
    return this.throwableQuery(async () => {
      const [row] = await this.orm.select().from(supportCases).where(eq(supportCases.id, id));
      return row;
    });
  }
  messages(caseId: string, admin: boolean) {
    return this.throwableQuery(() =>
      this.orm
        .select()
        .from(supportMessages)
        .where(
          and(
            eq(supportMessages.caseId, caseId),
            admin ? undefined : eq(supportMessages.visibility, "public")
          )
        )
        .orderBy(asc(supportMessages.sequence))
        .limit(100)
    );
  }
  list(userId: string | null, limit: number) {
    return this.throwableQuery(() =>
      this.orm
        .select()
        .from(supportCases)
        .where(userId === null ? undefined : eq(supportCases.userId, userId))
        .orderBy(desc(supportCases.updatedAt), desc(supportCases.id))
        .limit(limit)
    );
  }
}
