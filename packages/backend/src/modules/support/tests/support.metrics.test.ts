import { supportCaseMetrics, supportDistribution } from "../support.metrics";

it("measures visible publication, consecutive demand and unresolved cycles separately", () => {
  const at = (ms: number) => new Date(ms);
  const metrics = supportCaseMetrics(
    {
      id: "case",
      createdAt: at(0),
      status: "resolved",
      assignedUserId: null,
      waitingOn: "user",
      messages: [
        { sequence: 1, authorKind: "user", visibility: "public", publishedAt: at(1000) },
        { sequence: 2, authorKind: "user", visibility: "public", publishedAt: at(2000) },
        { sequence: 3, authorKind: "ai", visibility: "public", publishedAt: at(3000) },
        { sequence: 4, authorKind: "admin", visibility: "internal", publishedAt: at(4000) },
        { sequence: 5, authorKind: "admin", visibility: "public", publishedAt: at(7000) },
        { sequence: 6, authorKind: "user", visibility: "public", publishedAt: at(20000) },
        { sequence: 7, authorKind: "user", visibility: "public", publishedAt: at(22000) },
        { sequence: 8, authorKind: "admin", visibility: "public", publishedAt: null },
      ],
      events: [
        { sequence: 1, type: "case.created", occurredAt: at(0), data: {} },
        { sequence: 2, type: "handoff.requested", occurredAt: at(4000), data: {} },
        { sequence: 3, type: "case.updated", occurredAt: at(10000), data: { status: "resolved" } },
        {
          sequence: 4,
          type: "message.published",
          occurredAt: at(20000),
          data: { reopened: true, messageSequence: 6, cycle: 2 },
        },
        { sequence: 5, type: "case.updated", occurredAt: at(30000), data: { status: "resolved" } },
      ],
    },
    at(40000)
  );
  expect(metrics.firstResponseMs).toBe(2000);
  expect(metrics.firstHumanResponseMs).toBe(6000);
  expect(metrics.handoffWaitMs).toEqual([3000]);
  expect(metrics.outstandingSince).toEqual(at(20000));
  expect(metrics.activeUnresolvedMs).toBe(20000);
  expect(metrics.lifetimeResolutionElapsedMs).toBe(30000);
  expect(
    metrics.cycles.map((cycle) => [
      cycle.number,
      cycle.startedAt.getTime(),
      cycle.resolvedAt?.getTime(),
    ])
  ).toEqual([
    [1, 0, 10000],
    [2, 20000, 30000],
  ]);
  expect(supportDistribution([1000, 3000])).toEqual({ medianMs: 2000, p95Ms: 3000, samples: 2 });
});
