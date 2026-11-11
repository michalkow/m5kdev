import type IORedis from "ioredis";
import type { Pool } from "pg";
import { createBackendApp } from "./app";
import { WorkflowModule } from "./modules/workflow/workflow.module";
import { createTestPool } from "./test/postgresql";

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: { serialize: (value: unknown) => value, deserialize: (value: unknown) => value },
}));
jest.mock("better-auth/node", () => ({
  toNodeHandler: () => () => undefined,
  fromNodeHeaders: (headers: unknown) => headers,
}));
jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({ close: jest.fn() })),
  QueueEvents: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
  Worker: jest.fn().mockImplementation(() => ({ close: jest.fn(), on: jest.fn() })),
}));

function createRedis(): IORedis {
  const redis = {
    duplicate: () => redis,
    psubscribe: async () => 1,
    on: () => redis,
    publish: async () => 1,
    disconnect: () => undefined,
    quit: async () => "OK",
  };
  return redis as unknown as IORedis;
}

const urls = {
  VITE_APP_URL: "https://app.example.test",
  VITE_SERVER_URL: "https://api.example.test",
};

describe("createBackendApp Workflow schedulers", () => {
  let client: Pool;
  beforeEach(() => {
    client = createTestPool();
  });
  afterEach(async () => {
    await client.end();
  });

  const schedulersFor = (environment: string, options: { schedulers?: boolean } = {}) => {
    const redis = createRedis();
    const built = createBackendApp(
      {
        db: { client },
        redis: { create: () => redis },
        env: { ...urls, APP_ENV: environment, APP_SLUG: "editorial-desk" },
      },
      [
        { id: "auth" },
        new WorkflowModule({
          queues: { main: {} },
          defaultQueue: "main",
          boardPath: null,
          ...options,
        }),
      ] as never
    );
    return built.workflow?.service.schedulers;
  };

  it("turns schedulers off in Canary, which shares the Production database", () => {
    expect(schedulersFor("canary")).toBe(false);
  });

  it("keeps schedulers on in environments that own their database", () => {
    expect(schedulersFor("production")).toBe(true);
    expect(schedulersFor("staging")).toBe(true);
    expect(schedulersFor("development")).toBe(true);
  });

  it("honours an explicit schedulers option", () => {
    expect(schedulersFor("canary", { schedulers: true })).toBe(true);
    expect(schedulersFor("production", { schedulers: false })).toBe(false);
  });
});
