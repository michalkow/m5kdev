import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { createTestPool, prepareTestSchema } from "../../../test/postgresql";
import { workflows } from "../workflow.db";
import { WorkflowRepository } from "../workflow.repository";

const workflowSchema = { workflows };
type Orm = NodePgDatabase<typeof workflowSchema>;

describe("WorkflowRepository Deployment environment scope", () => {
  const client = createTestPool();
  const orm = drizzle(client, { schema: workflowSchema }) as Orm;
  const production = new WorkflowRepository({
    orm,
    schema: workflowSchema,
    environment: "production",
  });
  const canary = new WorkflowRepository({ orm, schema: workflowSchema, environment: "canary" });

  beforeAll(async () => {
    const namespace = await prepareTestSchema(client);
    await client.query(`
      CREATE TABLE "${namespace}".workflows (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT,
        environment TEXT NOT NULL DEFAULT 'production',
        job_id TEXT NOT NULL UNIQUE,
        job_name TEXT NOT NULL,
        queue_name TEXT NOT NULL,
        timeout INTEGER,
        tags TEXT[] DEFAULT '{}',
        input JSONB,
        output JSONB,
        status TEXT NOT NULL,
        error TEXT,
        retries INTEGER NOT NULL DEFAULT 0,
        finished_at TIMESTAMPTZ,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        CONSTRAINT workflows_environment_queue_job_unique UNIQUE (environment, queue_name, job_id)
      );
    `);
  });

  afterAll(async () => {
    await client.end();
  });

  it("lists only its own environment's stale rows for reconcile", async () => {
    await production.added({ jobId: "prod-1", jobName: "sync", queueName: "main", input: {} });
    await canary.added({ jobId: "canary-1", jobName: "sync", queueName: "main", input: {} });
    const later = new Date(Date.now() + 60_000);

    const canaryStale = await canary.listStale({ before: later, limit: 10 });
    const productionStale = await production.listStale({ before: later, limit: 10 });

    expect(canaryStale._unsafeUnwrap().map((row) => row.jobId)).toEqual(["canary-1"]);
    expect(productionStale._unsafeUnwrap().map((row) => row.jobId)).toEqual(["prod-1"]);
  });

  it("reads and lists a User's runs from its own environment only", async () => {
    await production.added({
      userId: undefined,
      jobId: "prod-read",
      jobName: "export",
      queueName: "main",
      input: {},
    });
    await client.query(
      `UPDATE "${process.env.DATABASE_SCHEMA}".workflows SET user_id = 'user-1' WHERE job_id = 'prod-read'`
    );

    expect((await canary.read({ jobId: "prod-read", userId: "user-1" })).isErr()).toBe(true);
    expect((await canary.list({ userId: "user-1" }))._unsafeUnwrap()).toEqual([]);
    expect(
      (await production.list({ userId: "user-1" }))._unsafeUnwrap().map((row) => row.jobId)
    ).toEqual(["prod-read"]);
  });

  it("records the environment on every lifecycle insert", async () => {
    await canary.completed({ jobId: "canary-cron", queueName: "main", jobName: "tick", output: 1 });

    const rows = await client.query(
      `SELECT environment FROM "${process.env.DATABASE_SCHEMA}".workflows WHERE job_id = 'canary-cron'`
    );
    expect(rows.rows).toEqual([{ environment: "canary" }]);
  });
});
