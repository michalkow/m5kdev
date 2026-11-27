import type { ExtractTablesWithRelations } from "drizzle-orm";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gt,
  gte,
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
  supportCorpora,
  supportDocuments,
  supportEvents,
  supportFeedback,
  supportMessages,
  supportReads,
  supportReplies,
  supportSettings,
  supportSettingsRevisions,
  supportStaffPreferences,
  supportUsage,
  supportWork,
} from "./support.db";

const tables = { supportCases, supportMessages, supportEvents, supportReads };
type Schema = typeof tables;
type Orm = NodePgDatabase<Schema>;
export type SupportTransaction = NodePgTransaction<Schema, ExtractTablesWithRelations<Schema>>;
export type SupportCaseRow = InferSelectModel<typeof supportCases>;
export type SupportMessageRow = InferSelectModel<typeof supportMessages>;
export type SupportWorkRow = InferSelectModel<typeof supportWork>;

export class SupportRepository extends BaseRepository<Orm, Schema, Record<string, never>> {
  transaction<T>(run: (tx: SupportTransaction) => Promise<T>) {
    return this.throwablePromise(() => this.orm.transaction(run));
  }
  async lockRequest(key: string, tx: SupportTransaction) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }
  async lockCase(id: string, tx: SupportTransaction, includePurging = false) {
    const [row] = await tx
      .select()
      .from(supportCases)
      .where(
        and(eq(supportCases.id, id), includePurging ? undefined : isNull(supportCases.purgingAt))
      )
      .for("update");
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
      const [row] = await this.orm
        .select()
        .from(supportCases)
        .where(and(eq(supportCases.id, id), isNull(supportCases.purgingAt)));
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
    >,
    after?: { updatedAt: Date; id: string }
  ) {
    return this.throwableQuery(() =>
      this.orm
        .select()
        .from(supportCases)
        .where(
          and(
            isNull(supportCases.purgingAt),
            after
              ? or(
                  lt(supportCases.updatedAt, after.updatedAt),
                  and(eq(supportCases.updatedAt, after.updatedAt), lt(supportCases.id, after.id))
                )
              : undefined,
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
        .limit(input.limit + 1)
    );
  }
  currentUser(userId: string) {
    return this.throwableQuery(
      async () =>
        (
          await this.orm
            .select({
              role: users.role,
              closedAt: users.closedAt,
              banned: users.banned,
              lifecycleVersion: users.lifecycleVersion,
            })
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
            admin ? undefined : isNotNull(supportMessages.publishedAt)
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
      )
      .for("update");
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
      .set({
        body: "",
        publishedBody: null,
        citations: [],
        aiProvenance: null,
        renditions: [],
        attachmentIds: [],
        redactedAt: new Date(),
        translationState: "none",
      })
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
  settings(tx?: SupportTransaction) {
    return this.throwableQuery(
      async () =>
        (
          await (tx ?? this.orm)
            .select()
            .from(supportSettings)
            .where(eq(supportSettings.id, "platform"))
        )[0]
    );
  }
  async saveSettings(
    config: typeof supportSettings.$inferInsert.config,
    expectedVersion: number,
    tx: SupportTransaction
  ) {
    const [current] = await tx
      .select()
      .from(supportSettings)
      .where(eq(supportSettings.id, "platform"))
      .for("update");
    if ((current?.version ?? 0) !== expectedVersion) return undefined;
    const row = current
      ? (
          await tx
            .update(supportSettings)
            .set({ config, version: current.version + 1, updatedAt: new Date() })
            .where(eq(supportSettings.id, "platform"))
            .returning()
        )[0]
      : (await tx.insert(supportSettings).values({ id: "platform", config }).returning())[0];
    await tx.insert(supportSettingsRevisions).values({ version: row.version, config: row.config });
    return row;
  }

  workingLocale(userId: string) {
    return this.throwableQuery(
      async () =>
        (
          await this.orm
            .select()
            .from(supportStaffPreferences)
            .where(eq(supportStaffPreferences.id, userId))
        )[0]?.locale
    );
  }
  async saveWorkingLocale(userId: string, locale: string, tx: SupportTransaction) {
    const [existing] = await tx
      .select()
      .from(supportStaffPreferences)
      .where(eq(supportStaffPreferences.id, userId));
    if (existing)
      await tx
        .update(supportStaffPreferences)
        .set({ locale })
        .where(eq(supportStaffPreferences.id, userId));
    else await tx.insert(supportStaffPreferences).values({ id: userId, locale });
  }
  async queueWork(row: typeof supportWork.$inferInsert, tx: SupportTransaction) {
    const owner = await this.lockUser(row.userId, tx);
    const source = row.messageId ? await this.message(row.messageId, tx) : null;
    const author = source?.authorUserId ? await this.lockUser(source.authorUserId, tx) : null;
    const [existing] = await tx
      .select()
      .from(supportWork)
      .where(
        and(
          eq(supportWork.caseId, row.caseId),
          row.messageId ? eq(supportWork.messageId, row.messageId) : isNull(supportWork.messageId),
          eq(supportWork.purpose, row.purpose),
          eq(supportWork.locale, row.locale),
          eq(supportWork.sourceHash, row.sourceHash),
          eq(supportWork.epoch, row.epoch),
          eq(supportWork.ownerEpoch, owner?.lifecycleVersion ?? 0),
          author
            ? eq(supportWork.authorEpoch, author.lifecycleVersion)
            : isNull(supportWork.authorEpoch),
          inArray(supportWork.state, ["queued", "running"])
        )
      );
    if (existing) return existing;
    return (
      await tx
        .insert(supportWork)
        .values({
          ...row,
          ownerEpoch: owner?.lifecycleVersion ?? 0,
          authorEpoch: author?.lifecycleVersion ?? null,
        })
        .returning()
    )[0];
  }
  async hasPendingDetection(messageId: string, tx: SupportTransaction) {
    const [row] = await tx
      .select({ id: supportWork.id })
      .from(supportWork)
      .where(
        and(
          eq(supportWork.messageId, messageId),
          eq(supportWork.purpose, "detect"),
          inArray(supportWork.state, ["queued", "running"])
        )
      )
      .limit(1);
    return Boolean(row);
  }
  pendingWork(now: Date) {
    return this.throwableQuery(() =>
      this.orm
        .select()
        .from(supportWork)
        .where(
          or(
            and(eq(supportWork.state, "queued"), lte(supportWork.nextAt, now)),
            and(eq(supportWork.state, "running"), lte(supportWork.leaseUntil, now))
          )
        )
        .orderBy(asc(supportWork.createdAt))
        .limit(20)
    );
  }
  async lockWork(id: string, tx: SupportTransaction) {
    return (await tx.select().from(supportWork).where(eq(supportWork.id, id)).for("update"))[0];
  }
  async updateWork(id: string, patch: Partial<SupportWorkRow>, tx: SupportTransaction) {
    return (
      await tx
        .update(supportWork)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(supportWork.id, id))
        .returning()
    )[0];
  }
  async updateMessage(id: string, patch: Partial<SupportMessageRow>, tx: SupportTransaction) {
    return (
      await tx.update(supportMessages).set(patch).where(eq(supportMessages.id, id)).returning()
    )[0];
  }
  async automationCounts(
    kind: "ai" | "translation",
    userId: string,
    month: Date,
    day: Date,
    now: Date,
    tx: SupportTransaction
  ) {
    const [monthly] = await tx
      .select({ total: count() })
      .from(supportUsage)
      .where(and(eq(supportUsage.kind, kind), gte(supportUsage.createdAt, month)));
    const [daily] = await tx
      .select({ total: count() })
      .from(supportUsage)
      .where(
        and(
          eq(supportUsage.kind, kind),
          eq(supportUsage.userId, userId),
          gte(supportUsage.createdAt, day)
        )
      );
    const [running] = await tx
      .select({ total: count() })
      .from(supportWork)
      .where(
        and(
          eq(supportWork.state, "running"),
          gt(supportWork.leaseUntil, now),
          kind === "ai" ? eq(supportWork.purpose, "answer") : ne(supportWork.purpose, "answer")
        )
      );
    return { monthly: monthly.total, daily: daily.total, running: running.total };
  }
  async reserveUsage(row: typeof supportUsage.$inferInsert, tx: SupportTransaction) {
    return (await tx.insert(supportUsage).values(row).returning())[0];
  }
  async completeUsage(id: string, outputCharacters: number, tx: SupportTransaction) {
    await tx.update(supportUsage).set({ outputCharacters }).where(eq(supportUsage.id, id));
  }
  async lockUser(userId: string, tx: SupportTransaction) {
    return (
      await tx
        .select({
          id: users.id,
          role: users.role,
          closedAt: users.closedAt,
          banned: users.banned,
          lifecycleVersion: users.lifecycleVersion,
        })
        .from(users)
        .where(eq(users.id, userId))
        .for("share")
    )[0];
  }
  corpusList() {
    return this.throwableQuery(() =>
      this.orm
        .select({
          id: supportCorpora.id,
          version: supportCorpora.version,
          applicationVersion: supportCorpora.applicationVersion,
          state: supportCorpora.state,
          error: supportCorpora.error,
          activatedAt: supportCorpora.activatedAt,
        })
        .from(supportCorpora)
        .orderBy(desc(supportCorpora.createdAt))
        .limit(30)
    );
  }
  async stageCorpus(manifest: typeof supportCorpora.$inferInsert.manifest, tx: SupportTransaction) {
    const [existing] = await tx
      .select()
      .from(supportCorpora)
      .where(eq(supportCorpora.version, manifest.version));
    if (existing) return existing;
    return (
      await tx
        .insert(supportCorpora)
        .values({
          version: manifest.version,
          applicationVersion: manifest.applicationVersion,
          manifest,
        })
        .returning()
    )[0];
  }
  pendingCorpora() {
    return this.throwableQuery(() =>
      this.orm
        .select()
        .from(supportCorpora)
        .where(eq(supportCorpora.state, "pending"))
        .orderBy(asc(supportCorpora.createdAt))
        .limit(1)
    );
  }
  async activateCorpus(
    id: string,
    entries: (typeof supportDocuments.$inferInsert)[],
    tx: SupportTransaction
  ) {
    const [current] = await tx
      .select()
      .from(supportCorpora)
      .where(eq(supportCorpora.id, id))
      .for("update");
    if (!current || current.state !== "pending") return;
    await tx
      .update(supportCorpora)
      .set({ state: "inactive" })
      .where(
        and(
          eq(supportCorpora.state, "active"),
          eq(supportCorpora.applicationVersion, current.applicationVersion)
        )
      );
    await tx.delete(supportDocuments).where(eq(supportDocuments.corpusId, id));
    if (entries.length) await tx.insert(supportDocuments).values(entries);
    await tx
      .update(supportCorpora)
      .set({ state: "active", activatedAt: new Date(), error: null })
      .where(eq(supportCorpora.id, id));
  }
  async failCorpus(id: string, error: string, tx: SupportTransaction) {
    await tx
      .update(supportCorpora)
      .set({ state: "failed", error })
      .where(and(eq(supportCorpora.id, id), eq(supportCorpora.state, "pending")));
  }
  async withdrawCorpus(version: string, tx: SupportTransaction) {
    const rows = await tx
      .update(supportCorpora)
      .set({ state: "withdrawn" })
      .where(eq(supportCorpora.version, version))
      .returning();
    for (const row of rows)
      await tx.delete(supportDocuments).where(eq(supportDocuments.corpusId, row.id));
  }
  retrieveDocumentation(
    applicationVersion: string,
    experience: string,
    locale: string,
    query: string,
    fallback: string
  ) {
    return this.throwableQuery(async () => {
      const [corpus] = await this.orm
        .select()
        .from(supportCorpora)
        .where(
          and(
            eq(supportCorpora.state, "active"),
            eq(supportCorpora.applicationVersion, applicationVersion)
          )
        )
        .limit(1);
      if (!corpus) return null;
      for (const language of [...new Set([locale, locale.split("-")[0], fallback])]) {
        const dictionary = language.startsWith("en") ? "english" : "simple";
        const vector = sql`to_tsvector(${dictionary}::regconfig, ${supportDocuments.title} || ' ' || ${supportDocuments.text})`;
        const terms = sql`websearch_to_tsquery(${dictionary}::regconfig, ${query})`;
        const documents = await this.orm
          .select()
          .from(supportDocuments)
          .where(
            and(
              eq(supportDocuments.corpusId, corpus.id),
              eq(supportDocuments.experience, experience),
              eq(supportDocuments.locale, language),
              sql`${vector} @@ ${terms}`
            )
          )
          .orderBy(sql`ts_rank(${vector},${terms}) desc`)
          .limit(5);
        if (documents.length) return { corpus, documents };
      }
      return { corpus, documents: [] };
    });
  }
  async corpusActive(id: string, applicationVersion: string, tx: SupportTransaction) {
    return (
      await tx
        .select({ id: supportCorpora.id })
        .from(supportCorpora)
        .where(
          and(
            eq(supportCorpora.id, id),
            eq(supportCorpora.applicationVersion, applicationVersion),
            eq(supportCorpora.state, "active")
          )
        )
        .for("share")
    )[0];
  }
  async latestUserMessage(caseId: string, tx: SupportTransaction) {
    return (
      await tx
        .select()
        .from(supportMessages)
        .where(
          and(
            eq(supportMessages.caseId, caseId),
            eq(supportMessages.authorKind, "user"),
            eq(supportMessages.visibility, "public"),
            isNotNull(supportMessages.publishedAt),
            isNull(supportMessages.redactedAt)
          )
        )
        .orderBy(desc(supportMessages.sequence))
        .limit(1)
    )[0];
  }
  metricCase(id: string, tx?: SupportTransaction) {
    const db = tx ?? this.orm;
    return this.throwableQuery(async () => {
      const [row] = await db.select().from(supportCases).where(eq(supportCases.id, id));
      if (!row) return null;
      const messages = await db
        .select({
          sequence: supportMessages.sequence,
          authorKind: supportMessages.authorKind,
          visibility: supportMessages.visibility,
          publishedAt: supportMessages.publishedAt,
        })
        .from(supportMessages)
        .where(eq(supportMessages.caseId, id));
      const events = await db
        .select({
          sequence: supportEvents.sequence,
          type: supportEvents.type,
          occurredAt: supportEvents.occurredAt,
          data: supportEvents.data,
        })
        .from(supportEvents)
        .where(eq(supportEvents.caseId, id))
        .orderBy(asc(supportEvents.sequence));
      return { ...row, messages, events };
    });
  }
  feedback(caseId: string, cycle: number, tx?: SupportTransaction) {
    return this.throwableQuery(
      async () =>
        (
          await (tx ?? this.orm)
            .select()
            .from(supportFeedback)
            .where(and(eq(supportFeedback.caseId, caseId), eq(supportFeedback.cycle, cycle)))
        )[0]
    );
  }
  async rate(row: typeof supportFeedback.$inferInsert, tx: SupportTransaction) {
    const [existing] = await tx
      .select()
      .from(supportFeedback)
      .where(and(eq(supportFeedback.caseId, row.caseId), eq(supportFeedback.cycle, row.cycle)));
    if (existing)
      return (
        await tx
          .update(supportFeedback)
          .set({ score: row.score, handledBy: row.handledBy, updatedAt: new Date() })
          .where(eq(supportFeedback.id, existing.id))
          .returning()
      )[0];
    return (await tx.insert(supportFeedback).values(row).returning())[0];
  }
  overviewCases(from: Date, to: Date) {
    return this.throwableQuery(() =>
      this.orm
        .select()
        .from(supportCases)
        .where(and(gte(supportCases.createdAt, from), lte(supportCases.createdAt, to)))
        .orderBy(desc(supportCases.createdAt), desc(supportCases.id))
        .limit(501)
    );
  }
  queueCounts() {
    return this.throwableQuery(() =>
      this.orm
        .select({
          waitingOn: supportCases.waitingOn,
          unassigned: sql<boolean>`${supportCases.assignedUserId} is null`,
          total: count(),
        })
        .from(supportCases)
        .where(and(eq(supportCases.status, "open"), isNull(supportCases.purgingAt)))
        .groupBy(supportCases.waitingOn, sql`${supportCases.assignedUserId} is null`)
    );
  }
  oldestUnanswered() {
    return this.throwableQuery(() =>
      this.orm
        .select({
          id: supportCases.id,
          subject: supportCases.subject,
          since: sql<Date>`min(${supportMessages.publishedAt})`.mapWith(
            (value) => new Date(String(value))
          ),
        })
        .from(supportCases)
        .innerJoin(supportMessages, eq(supportMessages.caseId, supportCases.id))
        .where(
          and(
            eq(supportCases.status, "open"),
            isNull(supportCases.purgingAt),
            eq(supportMessages.authorKind, "user"),
            eq(supportMessages.visibility, "public"),
            isNotNull(supportMessages.publishedAt),
            sql`not exists (select 1 from ${supportMessages} s where s.case_id=${supportCases.id} and s.visibility='public' and s.author_kind in ('admin','ai') and s.published_at >= ${supportMessages.publishedAt})`
          )
        )
        .groupBy(supportCases.id, supportCases.subject)
        .orderBy(sql`min(${supportMessages.publishedAt}) asc`)
        .limit(20)
    );
  }
  feedbackCounts(from: Date) {
    return this.throwableQuery(() =>
      this.orm
        .select({
          handledBy: supportFeedback.handledBy,
          score: supportFeedback.score,
          total: count(),
        })
        .from(supportFeedback)
        .where(gte(supportFeedback.updatedAt, from))
        .groupBy(supportFeedback.handledBy, supportFeedback.score)
    );
  }
  metricCases(ids: string[]) {
    return this.throwableQuery(async () => {
      if (!ids.length) return [];
      const rows = await this.orm.select().from(supportCases).where(inArray(supportCases.id, ids));
      const messages = await this.orm
        .select({
          caseId: supportMessages.caseId,
          sequence: supportMessages.sequence,
          authorKind: supportMessages.authorKind,
          visibility: supportMessages.visibility,
          publishedAt: supportMessages.publishedAt,
        })
        .from(supportMessages)
        .where(inArray(supportMessages.caseId, ids));
      const events = await this.orm
        .select({
          caseId: supportEvents.caseId,
          sequence: supportEvents.sequence,
          type: supportEvents.type,
          occurredAt: supportEvents.occurredAt,
          data: supportEvents.data,
        })
        .from(supportEvents)
        .where(inArray(supportEvents.caseId, ids))
        .orderBy(asc(supportEvents.sequence));
      const byCase = new Map(
        rows.map((row) => [
          row.id,
          { ...row, messages: [] as typeof messages, events: [] as typeof events },
        ])
      );
      for (const message of messages) byCase.get(message.caseId)?.messages.push(message);
      for (const event of events) byCase.get(event.caseId)?.events.push(event);
      return [...byCase.values()];
    });
  }
  casesForUser(userId: string) {
    return this.throwableQuery(() =>
      this.orm.select().from(supportCases).where(eq(supportCases.userId, userId))
    );
  }
  authoredMessages(userId: string) {
    return this.throwableQuery(() =>
      this.orm.select().from(supportMessages).where(eq(supportMessages.authorUserId, userId))
    );
  }
  allUserAttachments(userId: string) {
    return this.throwableQuery(() =>
      this.orm
        .select()
        .from(supportAttachments)
        .leftJoin(supportCases, eq(supportCases.id, supportAttachments.caseId))
        .where(or(eq(supportCases.userId, userId), eq(supportAttachments.userId, userId)))
    );
  }
  async invalidateWork(userId: string, tx: SupportTransaction) {
    const authored = tx
      .select({ id: supportMessages.id })
      .from(supportMessages)
      .where(eq(supportMessages.authorUserId, userId));
    const owned = tx
      .select({ id: supportCases.id })
      .from(supportCases)
      .where(eq(supportCases.userId, userId));
    await tx
      .update(supportWork)
      .set({ state: "cancelled", error: "user-lifecycle-changed", updatedAt: new Date() })
      .where(
        and(
          inArray(supportWork.state, ["queued", "running"]),
          or(inArray(supportWork.caseId, owned), inArray(supportWork.messageId, authored))
        )
      );
  }
  async deleteCase(id: string, tx: SupportTransaction) {
    // Explicit child cleanup also makes the boundary reliable in consumer schemas during migration rollout.
    const workIds = tx
      .select({ id: supportWork.id })
      .from(supportWork)
      .where(eq(supportWork.caseId, id));
    await tx.delete(supportUsage).where(inArray(supportUsage.workId, workIds));
    await tx.delete(supportWork).where(eq(supportWork.caseId, id));
    await tx.delete(supportFeedback).where(eq(supportFeedback.caseId, id));
    await tx.delete(supportAttachments).where(eq(supportAttachments.caseId, id));
    await tx.delete(supportReads).where(eq(supportReads.caseId, id));
    await tx.delete(supportEvents).where(eq(supportEvents.caseId, id));
    await tx.delete(supportMessages).where(eq(supportMessages.caseId, id));
    await tx
      .delete(taggings)
      .where(and(eq(taggings.resourceType, "support.case"), eq(taggings.resourceId, id)));
    await tx.delete(supportCases).where(eq(supportCases.id, id));
  }
  caseFiles(caseId: string) {
    return this.throwableQuery(() =>
      this.orm.select().from(supportAttachments).where(eq(supportAttachments.caseId, caseId))
    );
  }
  expiredCases(before: Date) {
    return this.throwableQuery(() =>
      this.orm
        .select()
        .from(supportCases)
        .where(and(eq(supportCases.status, "resolved"), lt(supportCases.resolvedAt, before)))
        .orderBy(asc(supportCases.resolvedAt))
        .limit(50)
    );
  }
  async eraseActor(userId: string, tx: SupportTransaction) {
    await tx.delete(supportEvents).where(eq(supportEvents.actorUserId, userId));
    await tx
      .update(supportMessages)
      .set({ authorUserId: null, requestHash: "", clientId: "" })
      .where(eq(supportMessages.authorUserId, userId));
    await tx
      .update(supportCases)
      .set({ initiatorUserId: null, subject: "" })
      .where(eq(supportCases.initiatorUserId, userId));
    await tx
      .update(supportCases)
      .set({ assignedUserId: null })
      .where(eq(supportCases.assignedUserId, userId));
    await tx.delete(supportStaffPreferences).where(eq(supportStaffPreferences.id, userId));
    await tx.delete(supportUsage).where(eq(supportUsage.userId, userId));
    await tx.delete(supportFeedback).where(eq(supportFeedback.userId, userId));
  }

  purgingCases() {
    return this.throwableQuery(() =>
      this.orm.select().from(supportCases).where(isNotNull(supportCases.purgingAt)).limit(20)
    );
  }

  async reserveAttachmentTx(
    input: { caseId: string; fileId: string; userId: string },
    tx: SupportTransaction
  ) {
    return (await tx.insert(supportAttachments).values(input).returning())[0];
  }
  async revokeUploadsForUser(userId: string, tx: SupportTransaction) {
    await tx
      .update(supportAttachments)
      .set({ revokedAt: new Date() })
      .where(eq(supportAttachments.userId, userId));
  }
  unreadTotal(userId: string, admin: boolean) {
    return this.throwableQuery(async () => {
      const [row] = await this.orm
        .select({ total: count() })
        .from(supportMessages)
        .innerJoin(supportCases, eq(supportCases.id, supportMessages.caseId))
        .leftJoin(
          supportReads,
          and(eq(supportReads.caseId, supportCases.id), eq(supportReads.userId, userId))
        )
        .where(
          and(
            admin ? undefined : eq(supportCases.userId, userId),
            isNull(supportCases.purgingAt),
            isNotNull(supportMessages.publishedAt),
            admin ? undefined : eq(supportMessages.visibility, "public"),
            or(isNull(supportMessages.authorUserId), ne(supportMessages.authorUserId, userId)),
            gt(supportMessages.sequence, sql`coalesce(${supportReads.sequence},0)`)
          )
        );
      return { count: row.total };
    });
  }
  expireUnusedAttachments(before: Date) {
    return this.throwableQuery(() =>
      this.orm
        .update(supportAttachments)
        .set({ revokedAt: new Date() })
        .where(
          and(
            isNull(supportAttachments.messageId),
            isNull(supportAttachments.revokedAt),
            lt(supportAttachments.createdAt, before)
          )
        )
        .returning({ id: supportAttachments.id })
    );
  }
}
