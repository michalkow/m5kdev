import { bigint, jsonb, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { v4 as uuidv4 } from "uuid";
import { appDatabaseSchema } from "../../base/database.schema";
import { members, organizations, users } from "../auth/auth.db";

/** Lifecycle of a file row relative to S3 upload completion. */
export type FileUploadStatus = "PENDING" | "UPLOADED" | "DELETED" | "FAILED";

export const files = appDatabaseSchema.table(
  "files",
  {
    id: text("id").primaryKey().$default(uuidv4),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$default(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    memberId: text("member_id").references(() => members.id, { onDelete: "set null" }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    bucket: text("bucket").notNull(),
    key: text("key").notNull(),
    originalName: text("original_name").notNull(),
    originalExtension: text("original_extension"),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    etag: text("etag"),
    checksumSha256: text("checksum_sha256"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    status: text("status").notNull().$type<FileUploadStatus>(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [uniqueIndex("files_bucket_key_unique").on(t.bucket, t.key)]
);
