import type { ExtractTablesWithRelations } from "drizzle-orm";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gt,
  type InferInsertModel,
  type InferSelectModel,
  ilike,
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
import { taggings, tags } from "../tag/tag.db";
import {
  supportAttachments,
  supportCases,
  supportEvents,
  supportMessages,
  supportReads,
  supportReplies,
} from "./support.db";

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
  list(
    userId: string | null,
    input: import("zod").infer<
      typeof import("@m5kdev/commons/modules/support/support.schema").supportListSchema
    >
  ) {
    return this.throwableQuery(() =>
      this.orm
        .select()
        .from(supportCases)
        .where(
          and(
            userId === null ? undefined : eq(supportCases.userId, userId),
            input.search
              ? or(
                  ilike(supportCases.subject, `%${input.search}%`),
                  exists(
                    this.orm
                      .select({ id: supportMessages.id })
                      .from(supportMessages)
                      .where(
                        and(
                          eq(supportMessages.caseId, supportCases.id),
                          eq(supportMessages.visibility, "public"),
                          isNotNull(supportMessages.publishedAt),
                          ilike(supportMessages.body, `%${input.search}%`)
                        )
                      )
                  )
                )
              : undefined,
            input.status ? eq(supportCases.status, input.status) : undefined,
            input.waitingOn ? eq(supportCases.waitingOn, input.waitingOn) : undefined,
            input.priority ? eq(supportCases.priority, input.priority) : undefined,
            input.assignedUserId === undefined
              ? undefined
              : input.assignedUserId === null
                ? isNull(supportCases.assignedUserId)
                : eq(supportCases.assignedUserId, input.assignedUserId),
            input.active
              ? or(isNull(supportCases.snoozedUntil), lte(supportCases.snoozedUntil, new Date()))
              : undefined,
            input.tagId
              ? exists(
                  this.orm
                    .select({ id: taggings.id })
                    .from(taggings)
                    .where(
                      and(
                        eq(taggings.resourceType, "support.case"),
                        eq(taggings.resourceId, supportCases.id),
                        eq(taggings.tagId, input.tagId)
                      )
                    )
                )
              : undefined
          )
        )
        .orderBy(desc(supportCases.updatedAt), desc(supportCases.id))
        .limit(input.limit)
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
  async record(
    current: SupportCaseRow,
    patch: Partial<SupportCaseRow>,
    type: string,
    actor: { userId?: string; kind: "user" | "admin" | "system" },
    data: Record<string, unknown>,
    tx: SupportTransaction
  ) {
    const now = new Date();
    const [row] = await tx
      .update(supportCases)
      .set({ ...patch, version: current.version + 1, updatedAt: now })
      .where(eq(supportCases.id, current.id))
      .returning();
    await tx.insert(supportEvents).values({
      caseId: current.id,
      sequence: row.version,
      type,
      actorKind: actor.kind,
      actorUserId: actor.userId,
      occurredAt: now,
      data,
    });
    return row;
  }
  async patchCase(id: string, patch: Partial<SupportCaseRow>, tx: SupportTransaction) {
    const [row] = await tx
      .update(supportCases)
      .set(patch)
      .where(eq(supportCases.id, id))
      .returning();
    return row;
  }
  dueCases(now: Date) {
    return this.throwableQuery(() =>
      this.orm
        .select()
        .from(supportCases)
        .where(and(eq(supportCases.status, "open"), lte(supportCases.snoozedUntil, now)))
        .limit(100)
    );
  }
  catalog() {
    return this.throwableQuery(async () => ({
      tags: await this.orm
        .select({ id: tags.id, name: tags.name })
        .from(tags)
        .where(and(eq(tags.scope, "support"), isNull(tags.deletedAt))),
      replies: await this.orm
        .select()
        .from(supportReplies)
        .orderBy(asc(supportReplies.title))
        .limit(500),
    }));
  }
  async saveCatalog(
    input: { kind: "tag" | "reply"; id?: string; name: string; body?: string; remove: boolean },
    tx: SupportTransaction
  ) {
    if (input.kind === "tag") {
      if (input.id) {
        if (input.remove)
          await tx
            .update(tags)
            .set({ deletedAt: new Date() })
            .where(and(eq(tags.id, input.id), eq(tags.scope, "support")));
        else
          await tx
            .update(tags)
            .set({ name: input.name, updatedAt: new Date() })
            .where(and(eq(tags.id, input.id), eq(tags.scope, "support")));
      } else
        await tx
          .insert(tags)
          .values({ name: input.name, scope: "support", assignableTo: ["support.case"] });
    } else if (input.id) {
      if (input.remove) await tx.delete(supportReplies).where(eq(supportReplies.id, input.id));
      else
        await tx
          .update(supportReplies)
          .set({ title: input.name, body: input.body ?? "", updatedAt: new Date() })
          .where(eq(supportReplies.id, input.id));
    } else await tx.insert(supportReplies).values({ title: input.name, body: input.body ?? "" });
  }
  async setTags(caseId: string, tagIds: string[], tx: SupportTransaction) {
    const allowed = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(and(inArray(tags.id, tagIds), eq(tags.scope, "support"), isNull(tags.deletedAt)));
    if (new Set(tagIds).size !== allowed.length) return false;
    await tx
      .delete(taggings)
      .where(and(eq(taggings.resourceType, "support.case"), eq(taggings.resourceId, caseId)));
    if (tagIds.length)
      await tx
        .insert(taggings)
        .values(
          tagIds.map((tagId) => ({ tagId, resourceType: "support.case", resourceId: caseId }))
        );
    return true;
  }
  assignedTags(caseId: string) {
    return this.throwableQuery(() =>
      this.orm
        .select({ id: taggings.tagId })
        .from(taggings)
        .innerJoin(tags, eq(tags.id, taggings.tagId))
        .where(
          and(
            eq(taggings.resourceType, "support.case"),
            eq(taggings.resourceId, caseId),
            eq(tags.scope, "support"),
            isNull(tags.deletedAt)
          )
        )
    );
  }
  reserveAttachment(input: { caseId: string; fileId: string; userId: string }) {
    return this.throwableQuery(() => this.orm.insert(supportAttachments).values(input).returning());
  }
  async attachments(caseId: string, fileIds: string[], tx: SupportTransaction) {
    return tx
      .select()
      .from(supportAttachments)
      .where(
        and(eq(supportAttachments.caseId, caseId), inArray(supportAttachments.fileId, fileIds))
      );
  }
  async linkAttachments(fileIds: string[], messageId: string, tx: SupportTransaction) {
    if (fileIds.length)
      await tx
        .update(supportAttachments)
        .set({ messageId })
        .where(inArray(supportAttachments.fileId, fileIds));
  }
  attachment(caseId: string, fileId: string) {
    return this.throwableQuery(
      async () =>
        (
          await this.orm
            .select({ attachment: supportAttachments, message: supportMessages })
            .from(supportAttachments)
            .innerJoin(supportMessages, eq(supportMessages.id, supportAttachments.messageId))
            .where(
              and(
                eq(supportAttachments.caseId, caseId),
                eq(supportAttachments.fileId, fileId),
                isNull(supportAttachments.revokedAt)
              )
            )
        )[0]
    );
  }
  async message(id: string, tx: SupportTransaction) {
    return (await tx.select().from(supportMessages).where(eq(supportMessages.id, id)))[0];
  }
  async redact(id: string, tx: SupportTransaction) {
    await tx
      .update(supportMessages)
      .set({ body: "", attachmentIds: [], redactedAt: new Date() })
      .where(eq(supportMessages.id, id));
    await tx
      .update(supportAttachments)
      .set({ revokedAt: new Date() })
      .where(eq(supportAttachments.messageId, id));
  }
  pendingFileCleanup() {
    return this.throwableQuery(() =>
      this.orm
        .select()
        .from(supportAttachments)
        .where(and(isNotNull(supportAttachments.revokedAt), isNull(supportAttachments.purgedAt)))
        .limit(100)
    );
  }
  fileCleaned(id: string) {
    return this.throwableQuery(() =>
      this.orm
        .update(supportAttachments)
        .set({ purgedAt: new Date() })
        .where(eq(supportAttachments.id, id))
    );
  }
}
