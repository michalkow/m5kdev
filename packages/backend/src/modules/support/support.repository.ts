import type { ExtractTablesWithRelations } from "drizzle-orm";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  type InferInsertModel,
  type InferSelectModel,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { NodePgDatabase, NodePgTransaction } from "drizzle-orm/node-postgres";
import { BaseRepository } from "../../base/base.repository";
import { users } from "../auth/auth.db";
import { supportCases, supportEvents, supportMessages, supportReads } from "./support.db";

const tables = { supportCases, supportMessages, supportEvents, supportReads };
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
  messages(
    caseId: string,
    admin: boolean,
    options: { beforeSequence?: number; throughSequence: number; limit: number }
  ) {
    return this.throwableQuery(async () =>
      (
        await this.orm
          .select()
          .from(supportMessages)
          .where(
            and(
              eq(supportMessages.caseId, caseId),
              lte(supportMessages.sequence, options.throughSequence),
              options.beforeSequence === undefined
                ? undefined
                : lt(supportMessages.sequence, options.beforeSequence),
              admin ? undefined : eq(supportMessages.visibility, "public"),
              admin ? undefined : isNotNull(supportMessages.publishedAt)
            )
          )
          .orderBy(desc(supportMessages.sequence))
          .limit(options.limit)
      ).reverse()
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
  currentUser(userId: string) {
    return this.throwableQuery(
      async () =>
        (
          await this.orm
            .select({ role: users.role, closedAt: users.closedAt, banned: users.banned })
            .from(users)
            .where(eq(users.id, userId))
        )[0]
    );
  }
  staffUserIds() {
    return this.throwableQuery(() =>
      this.orm
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.role, "admin"),
            isNull(users.closedAt),
            or(isNull(users.banned), eq(users.banned, false))
          )
        )
    );
  }
  changes(caseId: string, after: number, through: number, limit: number) {
    return this.throwableQuery(() =>
      this.orm
        .select()
        .from(supportEvents)
        .where(
          and(
            eq(supportEvents.caseId, caseId),
            gt(supportEvents.sequence, after),
            lte(supportEvents.sequence, through)
          )
        )
        .orderBy(asc(supportEvents.sequence))
        .limit(limit)
    );
  }
  changedMessages(caseId: string, sequences: number[], admin: boolean) {
    return this.throwableQuery(() =>
      this.orm
        .select()
        .from(supportMessages)
        .where(
          and(
            eq(supportMessages.caseId, caseId),
            inArray(supportMessages.sequence, sequences),
            admin ? undefined : eq(supportMessages.visibility, "public"),
            isNotNull(supportMessages.publishedAt)
          )
        )
        .orderBy(asc(supportMessages.sequence))
    );
  }
  unreadCounts(caseIds: string[], userId: string, admin: boolean) {
    return this.throwableQuery(() =>
      this.orm
        .select({ caseId: supportMessages.caseId, total: count() })
        .from(supportMessages)
        .leftJoin(
          supportReads,
          and(eq(supportReads.caseId, supportMessages.caseId), eq(supportReads.userId, userId))
        )
        .where(
          and(
            inArray(supportMessages.caseId, caseIds),
            gt(supportMessages.sequence, sql`coalesce(${supportReads.sequence}, 0)`),
            or(isNull(supportMessages.authorUserId), ne(supportMessages.authorUserId, userId)),
            isNotNull(supportMessages.publishedAt),
            admin ? undefined : eq(supportMessages.visibility, "public")
          )
        )
        .groupBy(supportMessages.caseId)
    );
  }
  async unread(caseId: string, userId: string, admin: boolean) {
    return (await this.unreadCounts([caseId], userId, admin)).map((rows) => rows[0]?.total ?? 0);
  }
  async markRead(caseId: string, userId: string, throughSequence: number, tx: SupportTransaction) {
    const [existing] = await tx
      .select()
      .from(supportReads)
      .where(and(eq(supportReads.caseId, caseId), eq(supportReads.userId, userId)));
    if (existing) {
      const sequence = Math.max(existing.sequence, throughSequence);
      await tx
        .update(supportReads)
        .set({ sequence, updatedAt: new Date() })
        .where(eq(supportReads.id, existing.id));
      return { sequence };
    }
    await tx.insert(supportReads).values({ caseId, userId, sequence: throughSequence });
    return { sequence: throughSequence };
  }
}
