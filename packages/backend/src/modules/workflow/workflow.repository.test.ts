import { createClient } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import * as workflowSchema from "./workflow.db";
import { WorkflowRepository } from "./workflow.repository";

type Schema = typeof workflowSchema;
type Orm = LibSQLDatabase<Schema>;

describe("WorkflowRepository.started", () => {
  const client = createClient({ url: ":memory:" });
  const orm = drizzle(client, { schema: workflowSchema }) as Orm;
  const repo = new WorkflowRepository({ orm, schema: workflowSchema }, {});

  beforeAll(async () => {
    await client.execute(`
      CREATE TABLE workflows (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT,
        job_id TEXT NOT NULL UNIQUE,
        job_name TEXT NOT NULL,
        queue_name TEXT NOT NULL,
        timeout INTEGER,
        tags TEXT DEFAULT '[]',
        input TEXT,
        output TEXT,
        status TEXT NOT NULL,
        error TEXT,
        retries INTEGER NOT NULL DEFAULT 0,
        finished_at INTEGER,
        processed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  });

  it("inserts a row when none exists (cron / no prior added)", async () => {
    const result = await repo.started({
      jobId: "cron-job-1",
      jobName: "daily-sync",
      queueName: "slow",
    });

    expect(result.isOk()).toBe(true);
    const rows = await orm
      .select()
      .from(workflowSchema.workflows)
      .where(eq(workflowSchema.workflows.jobId, "cron-job-1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("running");
    expect(rows[0]?.jobName).toBe("daily-sync");
  });

  it("updates to running when row already exists", async () => {
    await orm.insert(workflowSchema.workflows).values({
      id: "wf-1",
      jobId: "existing-1",
      jobName: "myJob",
      queueName: "fast",
      status: "queued",
      retries: 0,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await repo.started({
      jobId: "existing-1",
      jobName: "myJob",
      queueName: "fast",
    });

    expect(result.isOk()).toBe(true);
    const [row] = await orm
      .select()
      .from(workflowSchema.workflows)
      .where(eq(workflowSchema.workflows.jobId, "existing-1"));
    expect(row?.status).toBe("running");
    expect(row?.jobName).toBe("myJob");
  });
});
