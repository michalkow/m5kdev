const mockQueueAdd = jest.fn();
const mockQueueAddBulk = jest.fn();
const mockQueueClose = jest.fn().mockResolvedValue(undefined);
const mockQueueGetJobCounts = jest.fn();
const mockQueueGetJob = jest.fn();
const mockUpsertJobScheduler = jest.fn();
const mockGetJobSchedulers = jest.fn();
const mockRemoveJobScheduler = jest.fn();

const mockQueueEventsOn = jest.fn();
const mockQueueEventsClose = jest.fn().mockResolvedValue(undefined);

const mockWaitUntilFinished = jest.fn();

const mockDuplicate = jest.fn().mockReturnValue({});
const mockDisconnect = jest.fn();

/** Per-instance worker.close mocks (see Worker mock below). */
const workerCloseMocks: jest.Mock[] = [];

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    addBulk: mockQueueAddBulk,
    close: mockQueueClose,
    getJobCounts: mockQueueGetJobCounts,
    getJob: mockQueueGetJob,
    getJobs: jest.fn(),
    upsertJobScheduler: mockUpsertJobScheduler,
    getJobSchedulers: mockGetJobSchedulers,
    removeJobScheduler: mockRemoveJobScheduler,
  })),
  QueueEvents: jest.fn().mockImplementation(() => ({
    on: mockQueueEventsOn,
    close: mockQueueEventsClose,
  })),
  Worker: jest.fn().mockImplementation(() => {
    const close = jest.fn().mockResolvedValue(undefined);
    workerCloseMocks.push(close);
    return {
      on: jest.fn(),
      close,
    };
  }),
}));

jest.mock("ioredis", () =>
  jest.fn().mockImplementation(() => ({
    duplicate: mockDuplicate,
    disconnect: mockDisconnect,
  }))
);

jest.mock("uuid", () => ({
  v4: jest.fn().mockReturnValue("test-uuid-1234"),
}));

import type IORedis from "ioredis";
import type { WorkflowRepository } from "./workflow.repository";
import { WorkflowService } from "./workflow.service";

type MockedRepo = WorkflowRepository & Record<string, jest.Mock>;

function createMockRepository(): MockedRepo {
  return {
    read: jest.fn().mockResolvedValue({ isOk: () => true, value: {} }),
    list: jest.fn().mockResolvedValue({ isOk: () => true, value: [] }),
    added: jest.fn().mockResolvedValue({ isOk: () => true, value: {} }),
    addedMany: jest.fn().mockResolvedValue({ isOk: () => true, value: [] }),
    started: jest.fn().mockResolvedValue({ isOk: () => true, value: {} }),
    completed: jest.fn().mockResolvedValue({ isOk: () => true, value: {} }),
    failed: jest.fn().mockResolvedValue({ isOk: () => true, value: {} }),
  } as unknown as MockedRepo;
}

function createService(repo = createMockRepository()) {
  return {
    service: new WorkflowService(repo, {
      connection: {
        duplicate: mockDuplicate,
        disconnect: mockDisconnect,
      } as unknown as IORedis,
      queues: {
        fast: { concurrency: 10, defaultJobOptions: { attempts: 3 } },
        slow: { concurrency: 2 },
      },
      defaultQueue: "fast",
      defaults: {
        timeout: 30_000,
        jobOptions: { removeOnComplete: { age: 3600 } },
      },
    }),
    repo,
  };
}

describe("WorkflowService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    workerCloseMocks.length = 0;
    mockQueueGetJob.mockResolvedValue({ name: "myJob" });
    mockUpsertJobScheduler.mockResolvedValue({ id: "sched-1" });
    mockGetJobSchedulers.mockResolvedValue([]);
    mockRemoveJobScheduler.mockResolvedValue(true);
    mockQueueAdd.mockResolvedValue({ id: "job-1", waitUntilFinished: mockWaitUntilFinished });
    mockQueueAddBulk.mockResolvedValue([
      { id: "job-1", waitUntilFinished: mockWaitUntilFinished, data: { payload: "a" } },
      { id: "job-2", waitUntilFinished: mockWaitUntilFinished, data: { payload: "b" } },
    ]);
  });

  describe(".job()", () => {
    it("creates a fire-and-forget job definition with correct metadata", () => {
      const { service } = createService();
      const def = service.job({ name: "testJob", queue: "fast" });

      expect(def.jobName).toBe("testJob");
      expect(def.queueName).toBe("fast");
      expect(def._config.awaitable).toBe(false);
    });

    it("uses the default queue when none is specified", () => {
      const { service } = createService();
      const def = service.job({ name: "testJob" });

      expect(def.queueName).toBe("fast");
    });

    it("throws if the specified queue does not exist", () => {
      const { service } = createService();
      expect(() => service.job({ name: "testJob", queue: "nonexistent" })).toThrow(
        'Queue "nonexistent" is not configured'
      );
    });

    it("maps retries shorthand to attempts when attempts is not set", () => {
      const { service } = createService();
      const def = service.job({ name: "testJob", queue: "slow", retries: 5 });

      expect(def._config.jobOptions.attempts).toBe(5);
    });

    it("does not override explicit attempts with retries shorthand", () => {
      const { service } = createService();
      const def = service.job({
        name: "testJob",
        retries: 5,
        jobOptions: { attempts: 10 },
      });

      expect(def._config.jobOptions.attempts).toBe(10);
    });

    it("creates an awaitable job definition", () => {
      const { service } = createService();
      const def = service.job<{ id: string }, string>({
        name: "awaitableJob",
        awaitable: true,
      });

      expect(def._config.awaitable).toBe(true);
    });

    it("uses service-level default timeout", () => {
      const { service } = createService();
      const def = service.job({ name: "testJob" });

      expect(def._config.timeout).toBe(30_000);
    });

    it("allows per-job timeout override", () => {
      const { service } = createService();
      const def = service.job({ name: "testJob", timeout: 5_000 });

      expect(def._config.timeout).toBe(5_000);
    });

    it(".handle() stores the handler and returns the same definition", () => {
      const { service } = createService();
      const handler = jest.fn().mockResolvedValue(undefined);
      const def = service.job({ name: "handleJob" });

      const returned = def.handle(handler);

      expect(returned).toBe(def);
      expect(def._handler).toBe(handler);
    });

    it(".handle() preserves trigger after chaining", async () => {
      const { service } = createService();
      const handler = jest.fn().mockResolvedValue(undefined);
      const def = service.job({ name: "chainedJob" }).handle(handler);

      const jobId = await def.trigger({ data: "test" });

      expect(jobId).toBe("job-1");
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "chainedJob",
        { data: "test" },
        expect.objectContaining({ jobId: "test-uuid-1234" })
      );
    });
  });

  describe(".cron()", () => {
    it("creates a cron definition with cronName, pattern, and queue", () => {
      const { service } = createService();
      const def = service.cron({ name: "daily", pattern: "0 9 * * *" });

      expect(def.cronName).toBe("daily");
      expect(def.pattern).toBe("0 9 * * *");
      expect(def.queueName).toBe("fast");
    });

    it("throws if the same cron name is defined twice on the service", () => {
      const { service } = createService();
      service.cron({ name: "dup", pattern: "* * * * *" });
      expect(() => service.cron({ name: "dup", pattern: "0 0 * * *" })).toThrow(
        'Cron "dup" is already defined on this WorkflowService',
      );
    });

    it("throws if the queue is not configured", () => {
      const { service } = createService();
      expect(() =>
        service.cron({ name: "x", queue: "missing", pattern: "* * * * *" }),
      ).toThrow('Queue "missing" is not configured in WorkflowService');
    });

    it("maps retries to job template attempts when attempts unset", () => {
      const { service } = createService();
      const def = service.cron({ name: "c", pattern: "* * * * *", retries: 4 });
      expect(def._config.jobOptions.attempts).toBe(4);
    });

    it(".handle() stores the handler and returns the same definition", () => {
      const { service } = createService();
      const fn = jest.fn().mockResolvedValue(undefined);
      const def = service.cron({ name: "h", pattern: "* * * * *" });

      const ret = def.handle(fn);

      expect(ret).toBe(def);
      expect(def._handler).toBe(fn);
    });
  });

  describe("scheduler wrappers", () => {
    it("_upsertCronScheduler merges template options and calls upsertJobScheduler", async () => {
      const { service } = createService();
      await service._upsertCronScheduler("fast", "tick", "*/15 * * * *", {
        name: "tick",
        queueName: "fast",
        pattern: "*/15 * * * *",
        timeout: 60_000,
        jobOptions: { priority: 2 },
        workerOptions: {},
      });

      expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
        "tick",
        { pattern: "*/15 * * * *" },
        expect.objectContaining({
          name: "tick",
          data: {},
          opts: expect.objectContaining({
            priority: 2,
            attempts: 3,
          }),
        }),
      );
    });

    it("_getJobSchedulers and _removeJobScheduler delegate to the queue", async () => {
      const { service } = createService();
      mockGetJobSchedulers.mockResolvedValueOnce([{ key: "a" }]);
      const listed = await service._getJobSchedulers("slow", 0, 50, true);
      expect(listed).toEqual([{ key: "a" }]);
      expect(mockGetJobSchedulers).toHaveBeenCalledWith(0, 50, true);

      await service._removeJobScheduler("fast", "sched-1");
      expect(mockRemoveJobScheduler).toHaveBeenCalledWith("sched-1");
    });
  });

  describe("trigger()", () => {
    it("adds the job to the correct queue with merged options", async () => {
      const { service } = createService();
      const def = service.job({ name: "myJob", queue: "fast" });

      await def.trigger({ data: "test" });

      expect(mockQueueAdd).toHaveBeenCalledWith(
        "myJob",
        { data: "test" },
        expect.objectContaining({ jobId: "test-uuid-1234" })
      );
    });

    it("calls repository.added with correct metadata", async () => {
      const { service, repo } = createService();
      const def = service.job<{ userId: string; data: string }>({
        name: "myJob",
        meta: (payload) => ({ userId: payload.userId }),
      });

      await def.trigger({ userId: "user-1", data: "test" });

      expect(repo.added).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          jobId: "job-1",
          jobName: "myJob",
          queueName: "fast",
        })
      );
    });

    it("uses custom id function when provided", async () => {
      const { service } = createService();
      const def = service.job<{ key: string }>({
        name: "dedupJob",
        id: (payload) => `dedup-${payload.key}`,
      });

      await def.trigger({ key: "abc" });

      expect(mockQueueAdd).toHaveBeenCalledWith(
        "dedupJob",
        { key: "abc" },
        expect.objectContaining({ jobId: "dedup-abc" })
      );
    });

    it("resolves meta from TriggerOverrides over meta function", async () => {
      const { service, repo } = createService();
      const def = service.job({
        name: "metaJob",
        meta: () => ({ userId: "from-payload", tags: ["auto"] }),
      });

      await def.trigger({}, { userId: "override-user", tags: ["manual"] });

      expect(repo.added).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "override-user",
          tags: ["manual"],
        })
      );
    });

    it("merges options in correct priority order", async () => {
      const { service } = createService();
      const def = service.job({
        name: "mergeTest",
        queue: "fast",
        jobOptions: { priority: 5 },
      });

      await def.trigger({}, { jobOptions: { priority: 1 } });

      expect(mockQueueAdd).toHaveBeenCalledWith(
        "mergeTest",
        {},
        expect.objectContaining({ priority: 1 })
      );
    });

    it("awaitable trigger calls waitUntilFinished", async () => {
      mockWaitUntilFinished.mockResolvedValue("result-data");

      const { service } = createService();
      const def = service.job<Record<string, never>, string>({
        name: "awaitJob",
        awaitable: true,
        timeout: 5_000,
      });

      const result = await def.trigger({});

      expect(mockWaitUntilFinished).toHaveBeenCalled();
      expect(result).toBe("result-data");
    });

    it("fire-and-forget trigger returns job id", async () => {
      const { service } = createService();
      const def = service.job({ name: "fireJob" });

      const result = await def.trigger({ data: "test" });

      expect(result).toBe("job-1");
      expect(mockWaitUntilFinished).not.toHaveBeenCalled();
    });
  });

  describe("triggerMany()", () => {
    it("uses addBulk and repository.addedMany for batch inserts", async () => {
      const { service, repo } = createService();
      const def = service.job({ name: "batchJob" });

      const jobIds = await def.triggerMany([{ a: 1 }, { a: 2 }]);

      expect(jobIds).toEqual(["job-1", "job-2"]);
      expect(mockQueueAddBulk).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: "batchJob" }),
          expect.objectContaining({ name: "batchJob" }),
        ])
      );
      expect(repo.addedMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ jobName: "batchJob", jobId: "job-1" }),
          expect.objectContaining({ jobName: "batchJob", jobId: "job-2" }),
        ])
      );
    });
  });

  describe("queue inspection", () => {
    it("getQueues returns all configured queue names", () => {
      const { service } = createService();
      expect(service.getQueues()).toEqual(expect.arrayContaining(["fast", "slow"]));
    });

    it("getBullMqQueues returns one Queue per configured name in sorted order", () => {
      const { service } = createService();
      const names = service.getQueues().sort((a, b) => a.localeCompare(b));
      const qs = service.getBullMqQueues();
      expect(qs).toHaveLength(names.length);
    });

    it("getJobCounts delegates to the queue", async () => {
      mockQueueGetJobCounts.mockResolvedValue({ active: 2, waiting: 5 });
      const { service } = createService();

      const counts = await service.getJobCounts("fast");
      expect(counts).toEqual({ active: 2, waiting: 5 });
    });

    it("getJobCounts throws for unknown queue", async () => {
      const { service } = createService();
      await expect(service.getJobCounts("unknown")).rejects.toThrow();
    });
  });

  describe("read/list", () => {
    it("delegates read to repository", async () => {
      const { service, repo } = createService();
      await service.read({ jobId: "j1", userId: "u1" });
      expect(repo.read).toHaveBeenCalledWith({ jobId: "j1", userId: "u1" });
    });

    it("delegates list to repository", async () => {
      const { service, repo } = createService();
      await service.list({ userId: "u1" });
      expect(repo.list).toHaveBeenCalledWith({ userId: "u1" });
    });
  });

  describe("close()", () => {
    it("closes all queues, events, and disconnects redis", async () => {
      const { service } = createService();
      await service.close();

      expect(mockQueueClose).toHaveBeenCalled();
      expect(mockQueueEventsClose).toHaveBeenCalled();
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it("closes workers created by _createWorker before queues and events", async () => {
      const { service } = createService();
      const processor = jest.fn();

      service._createWorker("fast", processor);
      service._createWorker("slow", processor);

      await service.close();

      expect(workerCloseMocks).toHaveLength(2);
      expect(workerCloseMocks[0]).toHaveBeenCalled();
      expect(workerCloseMocks[1]).toHaveBeenCalled();
      expect(mockQueueClose).toHaveBeenCalled();
      expect(mockQueueEventsClose).toHaveBeenCalled();
      expect(mockDisconnect).toHaveBeenCalled();
    });
  });

  describe("lifecycle listeners", () => {
    it("attaches active/completed/failed listeners to QueueEvents", () => {
      createService();

      const eventNames = mockQueueEventsOn.mock.calls.map((call: unknown[]) => call[0]);
      expect(eventNames).toContain("active");
      expect(eventNames).toContain("completed");
      expect(eventNames).toContain("failed");
    });
  });
});
