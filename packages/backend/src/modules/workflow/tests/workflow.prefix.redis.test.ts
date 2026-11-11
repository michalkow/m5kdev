import IORedis from "ioredis";
import { ok } from "neverthrow";
import type { ModuleServicesContext } from "../../base/base.module";
import { WorkflowModule } from "../workflow.module";
import { WorkflowRegistry } from "../workflow.registry";
import type { WorkflowRepository } from "../workflow.repository";
import type { WorkflowService } from "../workflow.service";

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: { serialize: (value: unknown) => value, deserialize: (value: unknown) => value },
}));
jest.mock("better-auth/node", () => ({
  toNodeHandler: () => (): void => undefined,
  fromNodeHeaders: (headers: unknown) => headers,
}));

/**
 * Real BullMQ on a real Redis: two Deployment environments sharing one Redis are
 * isolated only by their Environment namespace. Set `TEST_REDIS_URL` to run.
 */
const redisUrl = process.env.TEST_REDIS_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

/** Workflow rows are not under test here; every lifecycle write succeeds. */
const stubRepository = new Proxy(
  {},
  { get: () => async () => ok(undefined) }
) as unknown as WorkflowRepository;

/**
 * BullMQ leaves connections it was handed open on close, so track every
 * duplicate the service makes and disconnect them when the suite ends.
 */
function trackDuplicates(connection: IORedis, created: IORedis[]): IORedis {
  const duplicate = connection.duplicate.bind(connection);
  connection.duplicate = ((...args: Parameters<IORedis["duplicate"]>) =>
    trackDuplicates(duplicate(...args), created)) as IORedis["duplicate"];
  created.push(connection);
  return connection;
}

type Environment = { service: WorkflowService; registry: WorkflowRegistry; processed: string[] };

describeWithRedis("Workflow Environment namespace on a shared Redis", () => {
  const slug = `m5kdev-test-${process.pid}-${Date.now()}`;
  const connections: IORedis[] = [];
  let redis: IORedis;
  let environments: Record<"canary" | "production", Environment>;
  let pingCanary: (id: string) => Promise<unknown>;
  let pingProduction: (id: string) => Promise<unknown>;

  const start = async (environment: "canary" | "production") => {
    const service = new WorkflowModule({
      queues: { main: { concurrency: 1 } },
      defaultQueue: "main",
      boardPath: null,
    }).services({
      repositories: { workflow: stubRepository },
      infra: { redis },
      appConfig: { environment, slug },
    } as unknown as ModuleServicesContext<
      { auth: never },
      { workflow: WorkflowRepository }
    >).workflow;
    const processed: string[] = [];
    // Same job name and queue in both environments: only the prefix separates them.
    const ping = service.job<{ id: string }>({ name: "ping" });
    const registry = new WorkflowRegistry(service);
    registry.register(ping, async ({ id }) => {
      processed.push(id);
    });
    await registry.start();
    return { environment: { service, registry, processed }, ping };
  };

  beforeAll(async () => {
    redis = trackDuplicates(
      new IORedis(redisUrl as string, { maxRetriesPerRequest: null }),
      connections
    );
    const canary = await start("canary");
    const production = await start("production");
    environments = { canary: canary.environment, production: production.environment };
    pingCanary = (id) => canary.ping.trigger({ id });
    pingProduction = (id) => production.ping.trigger({ id });
  });

  afterAll(async () => {
    for (const { registry, service } of Object.values(environments ?? {})) {
      await registry.stop();
      await service.close();
    }
    const keys = await redis.keys(`${slug}-*`);
    if (keys.length > 0) await redis.del(...keys);
    for (const connection of connections) connection.disconnect();
  });

  const waitFor = async (condition: () => boolean, timeoutMs = 5_000) => {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
      if (Date.now() > deadline) throw new Error("Timed out waiting for the job");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };

  it("processes a Canary job only on Canary's worker", async () => {
    await pingCanary("from-canary");
    await waitFor(() => environments.canary.processed.includes("from-canary"));

    expect(environments.production.processed).not.toContain("from-canary");
    expect(await environments.production.service.getJobCounts("main")).toMatchObject({
      waiting: 0,
      active: 0,
      completed: 0,
    });
  });

  it("processes a Production job only on Production's worker", async () => {
    await pingProduction("from-production");
    await waitFor(() => environments.production.processed.includes("from-production"));

    expect(environments.canary.processed).not.toContain("from-production");
  });

  it("keeps each environment's keys under its own prefix", async () => {
    expect(await redis.keys(`${slug}-canary:main:*`)).not.toEqual([]);
    expect(await redis.keys(`${slug}-production:main:*`)).not.toEqual([]);
  });
});
