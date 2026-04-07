import { WorkflowRegistry } from "./workflow.registry";
import type { WorkflowService } from "./workflow.service";
import type { WorkflowJobDefinition, ResolvedJobConfig } from "./workflow.types";

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

interface MockJob {
  name: string;
  data: unknown;
  id: string;
}

describe("WorkflowRegistry", () => {
  let mockCreateWorker: jest.Mock;
  let mockWorkerOn: jest.Mock;
  let mockWorkerClose: jest.Mock;
  let mockService: Pick<WorkflowService, "_createWorker">;
  let capturedProcessor: ((job: MockJob) => Promise<unknown>) | null;

  beforeEach(() => {
    capturedProcessor = null;
    mockWorkerOn = jest.fn();
    mockWorkerClose = jest.fn().mockResolvedValue(undefined);
    mockCreateWorker = jest.fn().mockImplementation(
      (_queueName: string, processor: (job: MockJob) => Promise<unknown>) => {
        capturedProcessor = processor;
        return { on: mockWorkerOn, close: mockWorkerClose };
      },
    );

    mockService = {
      _createWorker: mockCreateWorker,
    } as unknown as Pick<WorkflowService, "_createWorker">;
  });

  describe("register()", () => {
    it("registers a handler for a job definition", () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      const def = createMockDefinition("jobA");
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

    it("throws if called after start()", () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      const def = createMockDefinition("jobA");
      const handler = jest.fn().mockResolvedValue(undefined);

      registry.register(def, handler);
      registry.start();

      const def2 = createMockDefinition("jobB");
      expect(() => registry.register(def2, handler)).toThrow("after start()");
    });
  });

  describe("start()", () => {
    it("creates one worker per queue", () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);

      registry.register(
        createMockDefinition("jobA", "fast"),
        jest.fn().mockResolvedValue(undefined),
      );
      registry.register(
        createMockDefinition("jobB", "slow"),
        jest.fn().mockResolvedValue(undefined),
      );

      registry.start();

      expect(mockCreateWorker).toHaveBeenCalledTimes(2);
      const queueNames = mockCreateWorker.mock.calls.map(
        (c: unknown[]) => c[0],
      );
      expect(queueNames).toContain("fast");
      expect(queueNames).toContain("slow");
    });

    it("groups multiple jobs into one worker per queue", () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);

      registry.register(
        createMockDefinition("jobA", "fast"),
        jest.fn().mockResolvedValue(undefined),
      );
      registry.register(
        createMockDefinition("jobB", "fast"),
        jest.fn().mockResolvedValue(undefined),
      );

      registry.start();

      expect(mockCreateWorker).toHaveBeenCalledTimes(1);
      expect(mockCreateWorker.mock.calls[0][0]).toBe("fast");
    });

    it("throws if called twice", () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      registry.register(
        createMockDefinition("jobA"),
        jest.fn().mockResolvedValue(undefined),
      );

      registry.start();
      expect(() => registry.start()).toThrow("already been started");
    });
  });

  describe("processor dispatch", () => {
    it("dispatches to the correct handler by job name", async () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      const handlerA = jest.fn().mockResolvedValue("resultA");
      const handlerB = jest.fn().mockResolvedValue("resultB");

      registry.register(createMockDefinition("jobA", "fast"), handlerA);
      registry.register(createMockDefinition("jobB", "fast"), handlerB);
      registry.start();

      expect(capturedProcessor).not.toBeNull();
      const result = await capturedProcessor!({ name: "jobA", data: { x: 1 }, id: "j1" });

      expect(handlerA).toHaveBeenCalledWith({ x: 1 });
      expect(handlerB).not.toHaveBeenCalled();
      expect(result).toBe("resultA");
    });

    it("throws for unknown job names", async () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      registry.register(
        createMockDefinition("jobA", "fast"),
        jest.fn().mockResolvedValue(undefined),
      );
      registry.start();

      expect(capturedProcessor).not.toBeNull();
      await expect(
        capturedProcessor!({ name: "unknownJob", data: {}, id: "j1" }),
      ).rejects.toThrow("No handler registered for job: unknownJob");
    });

    it("returns null when handler returns undefined", async () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      const handler = jest.fn().mockResolvedValue(undefined);

      registry.register(createMockDefinition("jobA", "fast"), handler);
      registry.start();

      expect(capturedProcessor).not.toBeNull();
      const result = await capturedProcessor!({ name: "jobA", data: {}, id: "j1" });
      expect(result).toBeNull();
    });
  });

  describe("stop()", () => {
    it("closes all workers", async () => {
      const registry = new WorkflowRegistry(mockService as WorkflowService);
      registry.register(
        createMockDefinition("jobA", "fast"),
        jest.fn().mockResolvedValue(undefined),
      );
      registry.register(
        createMockDefinition("jobB", "slow"),
        jest.fn().mockResolvedValue(undefined),
      );

      registry.start();
      await registry.stop();

      expect(mockWorkerClose).toHaveBeenCalledTimes(2);
    });
  });
});
