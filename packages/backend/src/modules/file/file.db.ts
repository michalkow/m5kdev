import { integer, sqliteTable as table, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";
import { organizations, teams, users } from "../auth/auth.db";

/** Lifecycle of a file row relative to S3 upload completion. */
export type FileUploadStatus = "PENDING" | "UPLOADED" | "DELETED" | "FAILED";

export const files = table(
  "files",
  {
    id: text("id").primaryKey().$default(uuidv4),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$default(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    teamId: text("team_id").references(() => teams.id, { onDelete: "set null" }),
    bucket: text("bucket").notNull(),
    key: text("key").notNull(),
    originalName: text("original_name").notNull(),
    originalExtension: text("original_extension"),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes", { mode: "number" }),
    etag: text("etag"),
    checksumSha256: text("checksum_sha256"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    status: text("status").notNull().$type<FileUploadStatus>(),
    uploadedAt: integer("uploaded_at", { mode: "timestamp" }),
  },
  (t) => [uniqueIndex("files_bucket_key_unique").on(t.bucket, t.key)]
);
