import type { WorkflowStatus } from "@m5kdev/commons/modules/workflow/workflow.constants";
import { integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { v4 as uuidv4 } from "uuid";
import { appDatabaseSchema, jsonbValue } from "../../base/database.schema";
import type { DeploymentEnvironment } from "../../base/environment";
import { users } from "../auth/auth.db";

export const workflows = appDatabaseSchema.table(
  "workflows",
  {
    id: text("id").primaryKey().$default(uuidv4),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    /**
     * Deployment environment that enqueued the run (`APP_ENV`). With `queueName`
     * and `jobId` it rebuilds the BullMQ key `<slug>-<environment>:<queue>:<job>`.
     */
    environment: text("environment").$type<DeploymentEnvironment>().notNull().default("production"),
    /**
     * @deprecated The global unique on `job_id` is kept only so code from the
     * previous release (`ON CONFLICT (job_id)`) keeps working while Canary runs
     * against the Production database. Drop it in migration-contract issue #59.
     */
    jobId: text("job_id").unique().notNull(),
    jobName: text("job_name").notNull(),
    queueName: text("queue_name").notNull(),
    timeout: integer("timeout"),
    tags: text("tags")
      .array()
      .$default(() => [])
      .$type<string[]>(),
    input: jsonbValue("input"),
    output: jsonbValue("output"),
    status: text("status").notNull().$type<WorkflowStatus>(),
    error: text("error"),
    retries: integer("retries").notNull().default(0),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$default(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$default(() => new Date()),
  },
  (table) => [
    unique("workflows_environment_queue_job_unique").on(
      table.environment,
      table.queueName,
      table.jobId
    ),
  ]
);
