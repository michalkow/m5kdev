import type { InferSelectModel } from "drizzle-orm";
import type { supportCases, supportEvents, supportMessages } from "./support.db";

type Case = Pick<
  InferSelectModel<typeof supportCases>,
  "id" | "createdAt" | "status" | "assignedUserId" | "waitingOn"
>;
type Message = Pick<
  InferSelectModel<typeof supportMessages>,
  "sequence" | "authorKind" | "visibility" | "publishedAt"
>;
type Event = Pick<
  InferSelectModel<typeof supportEvents>,
  "sequence" | "type" | "occurredAt" | "data"
>;
export function supportDistribution(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    medianMs: n ? (n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : null,
    p95Ms: n ? sorted[Math.ceil(n * 0.95) - 1] : null,
    samples: n,
  };
}
/** Calendar durations from publication and state facts; never inferred active handle time. */
export function supportCaseMetrics(
  input: Case & { messages: Message[]; events: Event[] },
  now = new Date()
) {
  const visible = input.messages
    .filter(
      (message): message is Message & { publishedAt: Date } =>
        message.visibility === "public" && message.publishedAt !== null
    )
    .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime() || a.sequence - b.sequence);
  const firstUser = visible.find((message) => message.authorKind === "user");
  const firstReply = firstUser
    ? visible.find(
        (message) =>
          ["admin", "ai"].includes(message.authorKind) &&
          message.publishedAt >= firstUser.publishedAt
      )
    : undefined;
  const firstHuman = firstUser
    ? visible.find(
        (message) => message.authorKind === "admin" && message.publishedAt >= firstUser.publishedAt
      )
    : undefined;
  let outstandingSince: Date | null = null;
  for (const message of visible) {
    if (message.authorKind === "user") outstandingSince ??= message.publishedAt;
    else if (["admin", "ai"].includes(message.authorKind)) outstandingSince = null;
  }
  const events = [...input.events].sort((a, b) => a.sequence - b.sequence);
  const cycles: {
    number: number;
    startedAt: Date;
    resolvedAt: Date | null;
    eligible: boolean;
    handledBy: "human" | "ai" | null;
  }[] = [
    { number: 1, startedAt: input.createdAt, resolvedAt: null, eligible: false, handledBy: null },
  ];
  const messageCycles: Record<number, number> = { 1: 1 };
  let open = true;
  for (const event of events) {
    const cycle = cycles[cycles.length - 1];
    if (event.type === "case.updated" && event.data.status === "resolved" && open) {
      cycle.resolvedAt = event.occurredAt;
      open = false;
    }
    if (
      ((event.type === "message.published" && event.data.reopened === true) ||
        (event.type === "case.updated" && event.data.status === "open")) &&
      !open
    ) {
      cycles.push({
        number: cycle.number + 1,
        startedAt: event.occurredAt,
        resolvedAt: null,
        eligible: false,
        handledBy: null,
      });
      open = true;
    }
    if (event.type === "message.published" && typeof event.data.messageSequence === "number")
      messageCycles[event.data.messageSequence] =
        typeof event.data.cycle === "number" ? event.data.cycle : cycles[cycles.length - 1].number;
  }
  for (const cycle of cycles) {
    const messages = visible.filter(
      (message) =>
        messageCycles[message.sequence] === cycle.number ||
        (messageCycles[message.sequence] === undefined &&
          message.publishedAt >= cycle.startedAt &&
          (!cycle.resolvedAt || message.publishedAt <= cycle.resolvedAt))
    );
    cycle.handledBy = messages.some((message) => message.authorKind === "admin")
      ? "human"
      : messages.some((message) => message.authorKind === "ai")
        ? "ai"
        : null;
    cycle.eligible = Boolean(
      cycle.resolvedAt &&
        cycle.handledBy &&
        messages.some((message) => message.authorKind === "user")
    );
  }
  const handoffWaitMs = events
    .filter(
      (event) =>
        event.type === "handoff.requested" ||
        (event.type === "case.updated" &&
          event.data.handling === "human" &&
          event.data.previousHandling === "ai")
    )
    .flatMap((event) => {
      const reply = visible.find(
        (message) => message.authorKind === "admin" && message.publishedAt >= event.occurredAt
      );
      return reply ? [reply.publishedAt.getTime() - event.occurredAt.getTime()] : [];
    });
  const last = cycles[cycles.length - 1];
  return {
    id: input.id,
    firstResponseMs:
      firstUser && firstReply
        ? firstReply.publishedAt.getTime() - firstUser.publishedAt.getTime()
        : null,
    firstHumanResponseMs:
      firstUser && firstHuman
        ? firstHuman.publishedAt.getTime() - firstUser.publishedAt.getTime()
        : null,
    handoffWaitMs,
    outstandingSince,
    activeUnresolvedMs: cycles.reduce(
      (total, cycle) => total + (cycle.resolvedAt ?? now).getTime() - cycle.startedAt.getTime(),
      0
    ),
    lifetimeResolutionElapsedMs:
      input.status === "resolved" && last.resolvedAt
        ? last.resolvedAt.getTime() - input.createdAt.getTime()
        : null,
    cycles,
    hasUserExchange: Boolean(firstUser),
  };
}
