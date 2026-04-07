import { WorkflowRegistry } from "./workflow.registry";
import type { WorkflowService } from "./workflow.service";
import type {
  ResolvedCronConfig,
  ResolvedJobConfig,
  WorkflowCronDefinition,
  WorkflowJobDefinition,
} from "./workflow.types";

function createMockConfig(overrides?: Partial<ResolvedJobConfig>): ResolvedJobConfig {
  return {
    name: "testJob",
    queueName: "fast",
    awaitable: false,
    timeout: 60_000,
    awaitConcurrency: 10,
    jobOptions: {},
    workerOptions: {},
    ...overrides,
  };
}

function createMockCronResolved(overrides?: Partial<ResolvedCronConfig>): ResolvedCronConfig {
  return {
    name: "dailySync",
    queueName: "fast",
    pattern: "0 * * * *",
    timeout: 60_000,
    jobOptions: {},
    workerOptions: {},
    ...overrides,
  };
}

function createMockDefinition<P = unknown, R = unknown>(
  name: string,
  queueName = "fast",
  configOverrides?: Partial<ResolvedJobConfig>,
): WorkflowJobDefinition<P, R> {
  return {
    jobName: name,
    queueName,
    _config: createMockConfig({ name, queueName, ...configOverrides }),
    _handler: undefined,
    trigger: jest.fn(),
    triggerMany: jest.fn(),
  } as unknown as WorkflowJobDefinition<P, R>;
}

function createMockCronDefinition(
  name: string,
  queueName = "fast",
  configOverrides?: Partial<ResolvedCronConfig>,
): WorkflowCronDefinition {
  const resolved = createMockCronResolved({ name, queueName, ...configOverrides });
  return {
    cronName: name,
    queueName,
    pattern: resolved.pattern,
    _config: resolved,
    _handler: undefined,
    handle(fn: () => Promise<void>) {
      this._handler = fn;
      return this;
    },
  } as WorkflowCronDefinition;
}

function createMockDefinitionWithHandler<P = unknown, R = unknown>(
  name: string,
  queueName = "fast",
  configOverrides?: Partial<ResolvedJobConfig>,
): WorkflowJobDefinition<P, R> {
  const def = createMockDefinition<P, R>(name, queueName, configOverrides);
  def._handler = jest.fn().mockResolvedValue(undefined);
  return def;
}

function createMockCronWithHandler(
  name: string,
  queueName = "fast",
  configOverrides?: Partial<ResolvedCronConfig>,
): WorkflowCronDefinition {
  const def = createMockCronDefinition(name, queueName, configOverrides);
  def._handler = jest.fn().mockResolvedValue(undefined);
  return def;
}

interface MockJob {
  name: string;
  data: unknown;
  id: string;
}

function expectCapturedProcessor(
  processor: ((job: MockJob) => Promise<unknown>) | null,
): (job: MockJob) => Promise<unknown> {
  expect(processor).not.toBeNull();
  return processor as (job: MockJob) => Promise<unknown>;
}

describe("WorkflowRegistry", () => {
  let mockCreateWorker: jest.Mock;
  let mockWorkerOn: jest.Mock;
  let mockWorkerClose: jest.Mock;
  let mockCloseWorkers: jest.Mock;
  let mockUpsertCronScheduler: jest.Mock;
  let mockGetJobSchedulers: jest.Mock;
  let mockRemoveJobScheduler: jest.Mock;
  let mockService: Pick<
    WorkflowService,
    | "_createWorker"
    | "closeWorkers"
    | "_upsertCronScheduler"
    | "_getJobSchedulers"
    | "_removeJobScheduler"
  >;
  let capturedProcessor: ((job: MockJob) => Promise<unknown>) | null;
  const createdWorkers: Array<{ on: jest.Mock; close: jest.Mock }> = [];

  beforeEach(() => {
    capturedProcessor = null;
    createdWorkers.length = 0;
    mockWorkerOn = jest.fn();
    mockWorkerClose = jest.fn().mockResolvedValue(undefined);
    mockCreateWorker = jest.fn().mockImplementation(
      (_queueName: string, processor: (job: MockJob) => Promise<unknown>) => {
        capturedProcessor = processor;
        const worker = { on: mockWorkerOn, close: mockWorkerClose };
        createdWorkers.push(worker);
        return worker;
      },
    );

    mockCloseWorkers = jest.fn().mockImplementation(async () => {
      await Promise.all(createdWorkers.map((w) => w.close()));
    });

    mockUpsertCronScheduler = jest.fn().mockResolvedValue(undefined);
    mockGetJobSchedulers = jest.fn().mockResolvedValue([]);
    mockRemoveJobScheduler = jest.fn().mockResolvedValue(true);

    mockService = {
      _createWorker: mockCreateWorker,
      closeWorkers: mockCloseWorkers,
      _upsertCronScheduler: mockUpsertCronScheduler,
      _getJobSchedulers: mockGetJobSchedulers,
      _removeJobScheduler: mockRemoveJobScheduler,
    } as unknown as Pick<
      WorkflowService,
      | "_createWorker"
      | "closeWorkers"
      | "_upsertCronScheduler"
      | "_getJobSchedulers"
      | "_removeJobScheduler"
    >;
  });

  describe("register()", () => {
    it("registers a handler for a job definition", () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      const def = createMockDefinition("jobA");
      const handler = jest.fn().mockResolvedValue(undefined);

      expect(() => registry.register(def, handler)).not.toThrow();
    });

    it("registers a handler for a cron definition", () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      const def = createMockCronDefinition("nightly");
      const handler = jest.fn().mockResolvedValue(undefined);

      expect(() => registry.register(def, handler)).not.toThrow();
    });

    it("throws on duplicate job name registration", () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      const def = createMockDefinition("jobA");
      const handler = jest.fn().mockResolvedValue(undefined);

      registry.register(def, handler);
      expect(() => registry.register(def, handler)).toThrow('already registered for job "jobA"');
    });

    it("throws when job and cron share the same BullMQ job name", () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      registry.register(createMockDefinition("sync"), jest.fn().mockResolvedValue(undefined));
      expect(() =>
        registry.register(createMockCronDefinition("sync"), jest.fn().mockResolvedValue(undefined)),
      ).toThrow('already registered for job "sync"');
    });

    it("throws if called after start()", async () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      const def = createMockDefinition("jobA");
      const handler = jest.fn().mockResolvedValue(undefined);

      registry.register(def, handler);
      await registry.start();

      const def2 = createMockDefinition("jobB");
      expect(() => registry.register(def2, handler)).toThrow("after start()");
    });
  });

  describe("start()", () => {
    it("creates one worker per queue", async () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);

      registry.register(
        createMockDefinition("jobA", "fast"),
        jest.fn().mockResolvedValue(undefined),
      );
      registry.register(
        createMockDefinition("jobB", "slow"),
        jest.fn().mockResolvedValue(undefined),
      );

      await registry.start();

      expect(mockCreateWorker).toHaveBeenCalledTimes(2);
      const queueNames = mockCreateWorker.mock.calls.map((c: unknown[]) => c[0]);
      expect(queueNames).toContain("fast");
      expect(queueNames).toContain("slow");
      expect(mockUpsertCronScheduler).not.toHaveBeenCalled();
    });

    it("groups multiple jobs into one worker per queue", async () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);

      registry.register(
        createMockDefinition("jobA", "fast"),
        jest.fn().mockResolvedValue(undefined),
      );
      registry.register(
        createMockDefinition("jobB", "fast"),
        jest.fn().mockResolvedValue(undefined),
      );

      await registry.start();

      expect(mockCreateWorker).toHaveBeenCalledTimes(1);
      expect(mockCreateWorker.mock.calls[0][0]).toBe("fast");
    });

    it("calls upsert for each registered cron and reconciles stale schedulers", async () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      registry.register(
        createMockCronDefinition("keepMe", "fast", { pattern: "*/10 * * * *" }),
        jest.fn().mockResolvedValue(undefined),
      );
      mockGetJobSchedulers
        .mockResolvedValueOnce([
          { key: "keepMe", name: "keepMe", template: { name: "keepMe" } },
          { key: "staleCron", name: "staleCron" },
        ])
        .mockResolvedValue([]);

      await registry.start();

      expect(mockUpsertCronScheduler).toHaveBeenCalledWith(
        "fast",
        "keepMe",
        "*/10 * * * *",
        expect.objectContaining({ name: "keepMe", queueName: "fast" }),
      );
      expect(mockGetJobSchedulers).toHaveBeenCalledWith("fast", 0, 99);
      expect(mockRemoveJobScheduler).toHaveBeenCalledWith("fast", "staleCron");
      expect(mockRemoveJobScheduler).not.toHaveBeenCalledWith("fast", "keepMe");
    });

    it("rejects if called twice", async () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      registry.register(
        createMockDefinition("jobA"),
        jest.fn().mockResolvedValue(undefined),
      );

      await registry.start();
      await expect(registry.start()).rejects.toThrow("already been started");
    });
  });

  describe("processor dispatch", () => {
    it("dispatches to the correct handler by job name", async () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      const handlerA = jest.fn().mockResolvedValue("resultA");
      const handlerB = jest.fn().mockResolvedValue("resultB");

      registry.register(createMockDefinition("jobA", "fast"), handlerA);
      registry.register(createMockDefinition("jobB", "fast"), handlerB);
      await registry.start();

      const processor = expectCapturedProcessor(capturedProcessor);
      const result = await processor({ name: "jobA", data: { x: 1 }, id: "j1" });

      expect(handlerA).toHaveBeenCalledWith({ x: 1 });
      expect(handlerB).not.toHaveBeenCalled();
      expect(result).toBe("resultA");
    });

    it("invokes cron handler without job payload", async () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      const cronFn = jest.fn().mockResolvedValue(undefined);
      registry.register(createMockCronDefinition("tick", "fast"), cronFn);
      await registry.start();

      await expectCapturedProcessor(capturedProcessor)({
        name: "tick",
        data: { ignored: true },
        id: "j1",
      });
      expect(cronFn).toHaveBeenCalledWith();
    });

    it("throws for unknown job names", async () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      registry.register(
        createMockDefinition("jobA", "fast"),
        jest.fn().mockResolvedValue(undefined),
      );
      await registry.start();

      await expect(
        expectCapturedProcessor(capturedProcessor)({ name: "unknownJob", data: {}, id: "j1" }),
      ).rejects.toThrow("No handler registered for job: unknownJob");
    });

    it("returns null when handler returns undefined", async () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      const handler = jest.fn().mockResolvedValue(undefined);

      registry.register(createMockDefinition("jobA", "fast"), handler);
      await registry.start();

      const result = await expectCapturedProcessor(capturedProcessor)({
        name: "jobA",
        data: {},
        id: "j1",
      });
      expect(result).toBeNull();
    });
  });

  describe("registerService()", () => {
    it("discovers job definitions and registers their handlers", async () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      const fakeService = {
        jobA: createMockDefinitionWithHandler("jobA", "fast"),
        jobB: createMockDefinitionWithHandler("jobB", "slow"),
        notAJob: "just a string",
      };

      registry.registerService(fakeService);
      await registry.start();

      expect(mockCreateWorker).toHaveBeenCalledTimes(2);
    });

    it("discovers cron definitions with .handle()", async () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      registry.registerService({
        nightly: createMockCronWithHandler("nightly", "fast"),
      });
      await registry.start();

      expect(mockUpsertCronScheduler).toHaveBeenCalledWith(
        "fast",
        "nightly",
        "0 * * * *",
        expect.objectContaining({ name: "nightly" }),
      );
    });

    it("throws if a job definition has no .handle() attached", () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      const fakeService = {
        myJob: createMockDefinition("myJob", "fast"),
      };

      expect(() => registry.registerService(fakeService)).toThrow(
        'Job "myJob" on queue "fast" (property "myJob") has no .handle() attached',
      );
    });

    it("throws if a cron definition has no .handle() attached", () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      expect(() =>
        registry.registerService({
          c: createMockCronDefinition("noHandle", "fast"),
        }),
      ).toThrow(
        'Cron "noHandle" on queue "fast" (property "c") has no .handle() attached',
      );
    });

    it("throws on duplicate job name across services", () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      const serviceA = { jobA: createMockDefinitionWithHandler("jobA") };
      const serviceB = { duplicateJob: createMockDefinitionWithHandler("jobA") };

      registry.registerService(serviceA);
      expect(() => registry.registerService(serviceB)).toThrow(
        'already registered for job "jobA"',
      );
    });

    it("throws if called after start()", async () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      const serviceA = { jobA: createMockDefinitionWithHandler("jobA") };

      registry.registerService(serviceA);
      await registry.start();

      const serviceB = { jobB: createMockDefinitionWithHandler("jobB") };
      expect(() => registry.registerService(serviceB)).toThrow("after start()");
    });

    it("ignores non-job properties", async () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      const fakeService = {
        aString: "hello",
        aNumber: 42,
        aFunction: () => {},
        anObject: { foo: "bar" },
        nullValue: null,
        jobA: createMockDefinitionWithHandler("jobA"),
      };

      registry.registerService(fakeService);
      await registry.start();

      expect(mockCreateWorker).toHaveBeenCalledTimes(1);
    });

    it("works alongside manual register() calls", async () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      const manualDef = createMockDefinition("manualJob", "fast");
      const manualHandler = jest.fn().mockResolvedValue(undefined);

      registry.register(manualDef, manualHandler);
      registry.registerService({
        autoJob: createMockDefinitionWithHandler("autoJob", "fast"),
      });

      await registry.start();

      expect(mockCreateWorker).toHaveBeenCalledTimes(1);
    });
  });

  describe("stop()", () => {
    it("delegates worker shutdown to WorkflowService.closeWorkers", async () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      registry.register(
        createMockDefinition("jobA", "fast"),
        jest.fn().mockResolvedValue(undefined),
      );
      registry.register(
        createMockDefinition("jobB", "slow"),
        jest.fn().mockResolvedValue(undefined),
      );

      await registry.start();
      await registry.stop();

      expect(mockCloseWorkers).toHaveBeenCalledTimes(1);
      expect(mockWorkerClose).toHaveBeenCalledTimes(2);
    });
  });
});
