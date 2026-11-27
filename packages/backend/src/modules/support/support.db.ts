import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { v4 as uuidv4 } from "uuid";
import { appDatabaseSchema } from "../../base/database.schema";
import { users } from "../auth/auth.db";

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
export const supportCases = appDatabaseSchema.table(
  "support_cases",
  {
    id: text("id").primaryKey().$default(uuidv4),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    initiatorUserId: text("initiator_user_id").references(() => users.id, { onDelete: "set null" }),
    organizationId: text("organization_id"),
    subject: text("subject").notNull(),
    uiLocale: text("ui_locale").notNull().default("en"),
    supportLocale: text("support_locale"),
    detectedLocale: text("detected_locale"),
    experienceId: text("experience_id"),
    status: text("status").$type<"open" | "resolved">().notNull().default("open"),
    waitingOn: text("waiting_on")
      .$type<"support" | "user" | "external">()
      .notNull()
      .default("support"),
    priority: text("priority")
      .$type<"low" | "normal" | "high" | "urgent">()
      .notNull()
      .default("normal"),
    assignedUserId: text("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
    handling: text("handling").$type<"human" | "ai">().notNull().default("human"),
    handlingEpoch: integer("handling_epoch").notNull().default(0),
    cycle: integer("cycle").notNull().default(1),
    snoozedUntil: instant("snoozed_until"),
    resolvedAt: instant("resolved_at"),
    purgingAt: instant("purging_at"),
    origin: text("origin").$type<"user" | "admin">().notNull(),
    clientId: text("client_id").notNull(),
    requestHash: text("request_hash").notNull(),
    version: integer("version").notNull().default(1),
    lastSequence: integer("last_sequence").notNull().default(1),
    createdAt: instant("created_at")
      .notNull()
      .$default(() => new Date()),
    updatedAt: instant("updated_at")
      .notNull()
      .$default(() => new Date()),
  },
  (table) => [
    uniqueIndex("support_cases_request").on(table.initiatorUserId, table.clientId),
    index("support_cases_requester").on(table.userId, table.updatedAt),
    index("support_cases_cohort").on(table.createdAt),
    index("support_cases_snooze").on(table.status, table.snoozedUntil),
    index("support_cases_retention").on(table.status, table.resolvedAt),
    index("support_cases_purging").on(table.purgingAt).where(sql`${table.purgingAt} is not null`),
    index("support_cases_queue").on(table.status, table.waitingOn, table.assignedUserId),
  ]
);
export const supportMessages = appDatabaseSchema.table(
  "support_messages",
  {
    id: text("id").primaryKey().$default(uuidv4),
    caseId: text("case_id")
      .notNull()
      .references(() => supportCases.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    authorUserId: text("author_user_id").references(() => users.id, { onDelete: "set null" }),
    authorKind: text("author_kind").$type<"user" | "admin" | "ai" | "system">().notNull(),
    body: text("body").notNull(),
    attachmentIds: text("attachment_ids").array().notNull().$type<string[]>().default([]),
    redactedAt: instant("redacted_at"),
    authoredLocale: text("authored_locale"),
    targetLocale: text("target_locale"),
    publishedBody: text("published_body"),
    translationState: text("translation_state")
      .$type<"none" | "pending" | "ready" | "failed">()
      .notNull()
      .default("none"),
    citations: text("citations").array().notNull().$type<string[]>().default([]),
    aiProvenance: jsonb("ai_provenance").$type<{
      provider: string;
      promptVersion: string;
      corpusVersion: string;
      sourceHashes: string[];
    }>(),
    preview: boolean("preview").notNull().default(false),
    renditions: jsonb("renditions")
      .notNull()
      .default([])
      .$type<
        { locale: string; text: string; provider: string; sourceHash: string; createdAt: string }[]
      >(),
    visibility: text("visibility").$type<"public" | "internal">().notNull().default("public"),
    clientId: text("client_id").notNull(),
    requestHash: text("request_hash").notNull(),
    acceptedAt: instant("accepted_at").notNull(),
    publishedAt: instant("published_at"),
  },
  (table) => [
    uniqueIndex("support_messages_sequence").on(table.caseId, table.sequence),
    uniqueIndex("support_messages_request").on(table.caseId, table.authorUserId, table.clientId),
    index("support_messages_author").on(table.authorUserId),
    index("support_messages_publication").on(table.caseId, table.publishedAt),
  ]
);
export const supportEvents = appDatabaseSchema.table(
  "support_events",
  {
    id: text("id").primaryKey().$default(uuidv4),
    caseId: text("case_id")
      .notNull()
      .references(() => supportCases.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorKind: text("actor_kind").$type<"user" | "admin" | "ai" | "system">().notNull(),
    occurredAt: instant("occurred_at").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  },
  (table) => [uniqueIndex("support_events_sequence").on(table.caseId, table.sequence)]
);

export const supportReads = appDatabaseSchema.table(
  "support_reads",
  {
    id: text("id").primaryKey().$default(uuidv4),
    caseId: text("case_id")
      .notNull()
      .references(() => supportCases.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull().default(0),
    messageIds: text("message_ids").array().notNull().$type<string[]>().default([]),
    updatedAt: instant("updated_at")
      .notNull()
      .$default(() => new Date()),
  },
  (table) => [uniqueIndex("support_reads_reader").on(table.caseId, table.userId)]
);

export const supportReplies = appDatabaseSchema.table("support_replies", {
  id: text("id").primaryKey().$default(uuidv4),
  title: text("title").notNull(),
  body: text("body").notNull(),
  updatedAt: instant("updated_at")
    .notNull()
    .$default(() => new Date()),
});

export const supportAttachments = appDatabaseSchema.table(
  "support_attachments",
  {
    id: text("id").primaryKey().$default(uuidv4),
    caseId: text("case_id")
      .notNull()
      .references(() => supportCases.id, { onDelete: "cascade" }),
    fileId: text("file_id").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    messageId: text("message_id").references(() => supportMessages.id, { onDelete: "cascade" }),
    createdAt: instant("created_at")
      .notNull()
      .$default(() => new Date()),
    revokedAt: instant("revoked_at"),
    purgedAt: instant("purged_at"),
  },
  (t) => [
    uniqueIndex("support_attachments_file").on(t.fileId),
    index("support_attachments_case").on(t.caseId),
    index("support_attachments_owner").on(t.userId),
  ]
);

export const supportSettings = appDatabaseSchema.table("support_settings", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(1),
  config: jsonb("config")
    .notNull()
    .$type<
      import("zod").infer<
        typeof import("@m5kdev/commons/modules/support/support.schema").supportSettingsSchema
      >
    >(),
  updatedAt: instant("updated_at")
    .notNull()
    .$default(() => new Date()),
});
export const supportStaffPreferences = appDatabaseSchema.table("support_staff_preferences", {
  id: text("id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  locale: text("locale").notNull(),
});
export const supportWork = appDatabaseSchema.table(
  "support_work",
  {
    id: text("id").primaryKey().$default(uuidv4),
    caseId: text("case_id")
      .notNull()
      .references(() => supportCases.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(() => supportMessages.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ownerEpoch: integer("owner_epoch").notNull().default(0),
    authorEpoch: integer("author_epoch"),
    purpose: text("purpose").$type<"outbound" | "view" | "detect" | "answer">().notNull(),
    locale: text("locale").notNull(),
    sourceHash: text("source_hash").notNull(),
    epoch: integer("epoch").notNull(),
    state: text("state")
      .$type<"queued" | "running" | "succeeded" | "failed" | "cancelled">()
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    leaseUntil: instant("lease_until"),
    nextAt: instant("next_at")
      .notNull()
      .$default(() => new Date()),
    createdAt: instant("created_at")
      .notNull()
      .$default(() => new Date()),
    updatedAt: instant("updated_at")
      .notNull()
      .$default(() => new Date()),
  },
  (t) => [
    index("support_work_pending").on(t.state, t.nextAt),
    index("support_work_case").on(t.caseId),
  ]
);
export const supportUsage = appDatabaseSchema.table(
  "support_usage",
  {
    id: text("id").primaryKey().$default(uuidv4),
    workId: text("work_id")
      .notNull()
      .references(() => supportWork.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"translation" | "ai">().notNull(),
    provider: text("provider").notNull(),
    inputCharacters: integer("input_characters").notNull(),
    outputCharacters: integer("output_characters").notNull().default(0),
    createdAt: instant("created_at")
      .notNull()
      .$default(() => new Date()),
  },
  (t) => [
    index("support_usage_window").on(t.kind, t.createdAt),
    index("support_usage_user_window").on(t.kind, t.userId, t.createdAt),
    index("support_usage_work").on(t.workId),
  ]
);

export const supportCorpora = appDatabaseSchema.table(
  "support_corpora",
  {
    id: text("id").primaryKey().$default(uuidv4),
    version: text("version").notNull(),
    applicationVersion: text("application_version").notNull(),
    manifest: jsonb("manifest")
      .notNull()
      .$type<
        import("zod").infer<
          typeof import("@m5kdev/commons/modules/support/support.schema").supportManifestSchema
        >
      >(),
    state: text("state")
      .$type<"pending" | "active" | "inactive" | "failed" | "withdrawn">()
      .notNull()
      .default("pending"),
    error: text("error"),
    createdAt: instant("created_at")
      .notNull()
      .$default(() => new Date()),
    activatedAt: instant("activated_at"),
  },
  (t) => [uniqueIndex("support_corpora_version").on(t.version)]
);
export const supportDocuments = appDatabaseSchema.table(
  "support_documents",
  {
    id: text("id").primaryKey().$default(uuidv4),
    corpusId: text("corpus_id")
      .notNull()
      .references(() => supportCorpora.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    experience: text("experience").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    text: text("text").notNull(),
    sha256: text("sha256").notNull(),
  },
  (t) => [
    index("support_documents_context").on(t.corpusId, t.experience, t.locale),
    index("support_documents_search_simple").using(
      "gin",
      sql`to_tsvector('simple', ${t.title} || ' ' || ${t.text})`
    ),
    index("support_documents_search_english").using(
      "gin",
      sql`to_tsvector('english', ${t.title} || ' ' || ${t.text})`
    ),
  ]
);

export const supportFeedback = appDatabaseSchema.table(
  "support_feedback",
  {
    id: text("id").primaryKey().$default(uuidv4),
    caseId: text("case_id")
      .notNull()
      .references(() => supportCases.id, { onDelete: "cascade" }),
    cycle: integer("cycle").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    handledBy: text("handled_by").$type<"human" | "ai">().notNull(),
    createdAt: instant("created_at")
      .notNull()
      .$default(() => new Date()),
    updatedAt: instant("updated_at")
      .notNull()
      .$default(() => new Date()),
  },
  (t) => [uniqueIndex("support_feedback_cycle").on(t.caseId, t.cycle)]
);
export const supportSettingsRevisions = appDatabaseSchema.table(
  "support_settings_revisions",
  {
    id: text("id").primaryKey().$default(uuidv4),
    version: integer("version").notNull(),
    config: jsonb("config").notNull().$type<typeof supportSettings.$inferSelect.config>(),
    createdAt: instant("created_at")
      .notNull()
      .$default(() => new Date()),
  },
  (t) => [uniqueIndex("support_settings_revision").on(t.version)]
);
