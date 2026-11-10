import { Queue, QueueEvents, Worker } from "bullmq";
import type IORedis from "ioredis";
import type { ModuleServicesContext } from "../../base/base.module";
import { WorkflowModule } from "../workflow.module";
import type { WorkflowRepository } from "../workflow.repository";

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: { serialize: (value: unknown) => value, deserialize: (value: unknown) => value },
}));
jest.mock("better-auth/node", () => ({
  toNodeHandler: () => (): void => undefined,
  fromNodeHeaders: (headers: unknown) => headers,
}));
jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({ close: jest.fn() })),
  QueueEvents: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
  Worker: jest.fn().mockImplementation(() => ({ close: jest.fn(), on: jest.fn() })),
}));

const redis = { duplicate: () => redis, disconnect: jest.fn() } as unknown as IORedis;

function workflowService(
  appConfig: { environment: string; slug: string },
  options: { prefix?: string } = {}
) {
  const module = new WorkflowModule({
    queues: { fast: {}, slow: {} },
    defaultQueue: "fast",
    ...options,
  });
  return module.services({
    repositories: { workflow: {} as WorkflowRepository },
    infra: { redis },
    appConfig,
  } as unknown as ModuleServicesContext<{ auth: never }, { workflow: WorkflowRepository }>)
    .workflow;
}

function prefixesOf(mock: unknown): unknown[] {
  return (mock as jest.Mock).mock.calls.map(([, options]) => (options as { prefix?: string }).prefix);
}

describe("Workflow Environment namespace", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("prefixes every queue, queue-events listener and worker with <APP_SLUG>-<APP_ENV>", () => {
    const service = workflowService({ environment: "canary", slug: "editorial-desk" });
    service._createWorker("slow", async () => undefined);

    expect(prefixesOf(Queue)).toEqual(["editorial-desk-canary", "editorial-desk-canary"]);
    expect(prefixesOf(QueueEvents)).toEqual(["editorial-desk-canary", "editorial-desk-canary"]);
    expect((Worker as unknown as jest.Mock).mock.calls[0]?.[2]).toMatchObject({
      prefix: "editorial-desk-canary",
    });
  });

  it("keeps semantic queue names unchanged", () => {
    workflowService({ environment: "production", slug: "editorial-desk" });

    expect((Queue as unknown as jest.Mock).mock.calls.map(([name]) => name)).toEqual([
      "fast",
      "slow",
    ]);
  });
});
