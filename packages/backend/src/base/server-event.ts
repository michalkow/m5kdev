import { SERVER_EVENT_SUBSCRIBE_PATH } from "@m5kdev/commons/modules/base/server-event.schema";
import type { Response } from "express";
import type IORedis from "ioredis";
import type { Logger } from "pino";

export { SERVER_EVENT_SUBSCRIBE_PATH };

const CHANNEL_PREFIX = "m5kdev:server-event:";
const KEEPALIVE_MS = 15_000;

export interface ServerEventEmitInput {
  readonly userId: string;
  readonly payload: unknown;
}

export interface ServerEventBatchEmitInput {
  readonly userIds: readonly string[];
  readonly payload: unknown;
}

export interface ServerEventBus {
  emit(input: ServerEventEmitInput): void;
  batchEmit(input: ServerEventBatchEmitInput): void;
  attach(input: { userId: string; res: Response }): void;
  close(): void;
}

export function createServerEventBus(options: { redis?: IORedis; logger: Logger }): ServerEventBus {
  const connections = new Map<string, Set<Response>>();
  const keepalives = new Map<Response, ReturnType<typeof setInterval>>();
  let subscriber: IORedis | undefined;
  let closed = false;

  const writeFrame = (res: Response, chunk: string): void => {
    if (res.writableEnded) return;
    try {
      res.write(chunk);
    } catch (err) {
      options.logger.error({ err }, "Server event write failed");
    }
  };

  const deliverSerialized = (input: { userId: string; serialized: string }): void => {
    const responses = connections.get(input.userId);
    if (!responses) return;
    const frame = `data: ${input.serialized}\n\n`;
    for (const res of responses) {
      writeFrame(res, frame);
    }
  };

  if (options.redis) {
    subscriber = options.redis.duplicate();
    void subscriber.psubscribe(`${CHANNEL_PREFIX}*`);
    subscriber.on("pmessage", (_pattern: string, channel: string, message: string) => {
      const userId = channel.startsWith(CHANNEL_PREFIX) ? channel.slice(CHANNEL_PREFIX.length) : "";
      if (!userId) return;
      try {
        JSON.parse(message);
      } catch (err) {
        options.logger.error({ err, channel }, "Dropped non-JSON Server event from Redis");
        return;
      }
      deliverSerialized({ userId, serialized: message });
    });
    subscriber.on("error", (err: Error) => {
      options.logger.error({ err }, "Server event Redis subscriber error");
    });
  }

  const detach = (userId: string, res: Response): void => {
    const timer = keepalives.get(res);
    if (timer) {
      clearInterval(timer);
      keepalives.delete(res);
    }
    const responses = connections.get(userId);
    if (!responses) return;
    responses.delete(res);
    if (responses.size === 0) connections.delete(userId);
  };

  const deliverPayload = (input: { userIds: readonly string[]; payload: unknown }): void => {
    if (closed) return;
    const uniqueUserIds = [...new Set(input.userIds.filter((id) => id.length > 0))];
    if (uniqueUserIds.length === 0) return;

    let serialized: string;
    try {
      serialized = JSON.stringify(input.payload);
    } catch (err) {
      options.logger.error({ err }, "Dropped non-serializable Server event emit");
      return;
    }
    if (serialized === undefined) return;

    for (const userId of uniqueUserIds) {
      if (options.redis) {
        void options.redis
          .publish(`${CHANNEL_PREFIX}${userId}`, serialized)
          .catch((err: unknown) => {
            options.logger.error({ err, userId }, "Server event Redis publish failed");
          });
      } else {
        deliverSerialized({ userId, serialized });
      }
    }
  };

  return {
    emit(input) {
      deliverPayload({ userIds: [input.userId], payload: input.payload });
    },

    batchEmit(input) {
      deliverPayload(input);
    },

    attach({ userId, res }) {
      if (closed) {
        res.status(503).end();
        return;
      }

      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      if (typeof res.flushHeaders === "function") {
        res.flushHeaders();
      }
      writeFrame(res, ": ok\n\n");

      let responses = connections.get(userId);
      if (!responses) {
        responses = new Set();
        connections.set(userId, responses);
      }
      responses.add(res);

      const timer = setInterval(() => {
        writeFrame(res, ": keepalive\n\n");
      }, KEEPALIVE_MS);
      timer.unref();
      keepalives.set(res, timer);

      const onClose = (): void => {
        detach(userId, res);
      };
      res.on("close", onClose);
      res.req.on("close", onClose);
    },

    close() {
      closed = true;
      for (const [userId, responses] of connections) {
        for (const res of responses) {
          const timer = keepalives.get(res);
          if (timer) clearInterval(timer);
          if (res.writableEnded) continue;
          try {
            res.end();
          } catch (err) {
            options.logger.error({ err, userId }, "Server event close failed");
          }
        }
        connections.delete(userId);
      }
      keepalives.clear();
      if (subscriber) {
        subscriber.disconnect();
        subscriber = undefined;
      }
    },
  };
}
