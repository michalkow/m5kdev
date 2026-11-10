const mockQueueGetJob = jest.fn();

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({ getJob: mockQueueGetJob, close: jest.fn() })),
  QueueEvents: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import type IORedis from "ioredis";
import type { DeploymentEnvironment } from "../../../base/environment";
import { createTestPool, prepareTestSchema } from "../../../test/postgresql";
import { workflows } from "../workflow.db";
import { WorkflowRepository } from "../workflow.repository";
import { WorkflowService } from "../workflow.service";

const workflowSchema = { workflows };
type Orm = NodePgDatabase<typeof workflowSchema>;

const redis = { duplicate: () => redis, disconnect: jest.fn() } as unknown as IORedis;

/**
 * Reconcile at the WorkflowService surface: real PostgreSQL rows scoped by
 * Deployment environment, BullMQ mocked at the boundary (every job is missing
 * from Redis, as it is when another environment's prefix holds it).
 */
describe("WorkflowService reconcile Deployment environment scope", () => {
  const client = createTestPool();
  const orm = drizzle(client, { schema: workflowSchema }) as Orm;
  let namespace = "";

  const serviceFor = (environment: DeploymentEnvironment) =>
    new WorkflowService(new WorkflowRepository({ orm, schema: workflowSchema, environment }), {
      connection: redis,
      prefix: `editorial-desk-${environment}`,
      queues: { main: {} },
      defaultQueue: "main",
      reconcile: { enabled: true, graceSeconds: 60 },
    });

  const statusOf = async (jobId: string) =>
    (
      await client.query<{ status: string; error: string | null }>(
        `SELECT status, error FROM "${namespace}".workflows WHERE job_id = $1`,
        [jobId]
      )
    ).rows[0];

  beforeAll(async () => {
    namespace = await prepareTestSchema(client);
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

  beforeEach(async () => {
    mockQueueGetJob.mockReset().mockResolvedValue(undefined);
    await client.query(`DELETE FROM "${namespace}".workflows`);
    // A Production run enqueued before the grace window: stale and missing from Canary's Redis prefix.
    const production = new WorkflowRepository({
      orm,
      schema: workflowSchema,
      environment: "production",
    });
    await production.added({ jobId: "prod-sync", jobName: "sync", queueName: "main", input: {} });
    await client.query(
      `UPDATE "${namespace}".workflows SET updated_at = now() - interval '1 hour' WHERE job_id = 'prod-sync'`
    );
  });

  afterAll(async () => {
    await client.end();
  });

  it("leaves a stale Production row untouched when Canary reconciles", async () => {
    await serviceFor("canary").reconcile();

    expect(mockQueueGetJob).not.toHaveBeenCalled();
    expect(await statusOf("prod-sync")).toEqual({ status: "queued", error: null });
  });

  it("fails its own missing job when Production reconciles", async () => {
    await serviceFor("production").reconcile();

    expect(mockQueueGetJob).toHaveBeenCalledWith("prod-sync");
    expect(await statusOf("prod-sync")).toEqual({
      status: "failed",
      error: "reconciled: job missing from Redis",
    });
  });
});
