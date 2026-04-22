import type { WorkflowStatus } from "@m5kdev/commons/modules/workflow/workflow.constants";
import { integer, sqliteTable as table, text } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";
import { users } from "../auth/auth.db";

export const workflows = table("workflows", {
  id: text("id").primaryKey().$default(uuidv4),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  jobId: text("job_id").unique().notNull(),
  jobName: text("job_name").notNull(),
  queueName: text("queue_name").notNull(),
  timeout: integer("timeout"),
  tags: text("tags", { mode: "json" })
    .$default(() => [])
    .$type<string[]>(),
  input: text("input", { mode: "json" }),
  output: text("output", { mode: "json" }),
  status: text("status").notNull().$type<WorkflowStatus>(),
  error: text("error"),
  retries: integer("retries").notNull().default(0),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  processedAt: integer("processed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
});
