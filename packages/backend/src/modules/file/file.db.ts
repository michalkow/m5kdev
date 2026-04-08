import { integer, sqliteTable as table, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";
import {
  createDbCreatedAt,
  createDbDeletedAt,
  createDbOrganizationId,
  createDbTeamId,
  createDbUpdatedAt,
  createDbUserId,
} from "../base/base.db";

/** Lifecycle of a file row relative to S3 upload completion. */
export type FileUploadStatus = "PENDING" | "UPLOADED" | "DELETED" | "FAILED";

export const files = table(
  "files",
  {
    id: text("id").primaryKey().$default(uuidv4),
    createdAt: createDbCreatedAt(),
    updatedAt: createDbUpdatedAt(),
    deletedAt: createDbDeletedAt(),
    userId: createDbUserId(),
    organizationId: createDbOrganizationId(),
    teamId: createDbTeamId(),
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
