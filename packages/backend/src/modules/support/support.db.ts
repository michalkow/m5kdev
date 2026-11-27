import { index, integer, jsonb, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
    visibility: text("visibility").$type<"public" | "internal">().notNull().default("public"),
    clientId: text("client_id").notNull(),
    requestHash: text("request_hash").notNull(),
    acceptedAt: instant("accepted_at").notNull(),
    publishedAt: instant("published_at"),
  },
  (table) => [
    uniqueIndex("support_messages_sequence").on(table.caseId, table.sequence),
    uniqueIndex("support_messages_request").on(table.caseId, table.authorUserId, table.clientId),
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
