import {
  type ServerEventEnvelope,
  SERVER_EVENT_SUBSCRIBE_PATH,
  serverEventEnvelopeSchema,
} from "@m5kdev/commons/modules/base/server-event.schema";
import type { Response } from "express";
import type IORedis from "ioredis";
import type { Logger } from "pino";

export { SERVER_EVENT_SUBSCRIBE_PATH };

const CHANNEL_PREFIX = "m5kdev:server-event:";
const KEEPALIVE_MS = 15_000;

export interface ServerEventEmitInput extends ServerEventEnvelope {
  readonly userIds: readonly string[];
}

export interface ServerEventBus {
  emit(input: ServerEventEmitInput): void;
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

  const writeEnvelope = (res: Response, envelope: ServerEventEnvelope): void => {
    writeFrame(res, `data: ${JSON.stringify(envelope)}\n\n`);
  };

  const deliverLocal = (userId: string, envelope: ServerEventEnvelope): void => {
    const responses = connections.get(userId);
    if (!responses) return;
    for (const res of responses) {
      writeEnvelope(res, envelope);
    }
  };

  if (options.redis) {
    subscriber = options.redis.duplicate();
    void subscriber.psubscribe(`${CHANNEL_PREFIX}*`);
    subscriber.on("pmessage", (_pattern: string, channel: string, message: string) => {
      const userId = channel.startsWith(CHANNEL_PREFIX) ? channel.slice(CHANNEL_PREFIX.length) : "";
      if (!userId) return;
      let raw: unknown;
      try {
        raw = JSON.parse(message) as unknown;
      } catch (err) {
        options.logger.error({ err, channel }, "Dropped non-JSON Server event from Redis");
        return;
      }
      const parsed = serverEventEnvelopeSchema.safeParse(raw);
      if (!parsed.success) {
        options.logger.error({ channel }, "Dropped invalid Server event from Redis");
        return;
      }
      deliverLocal(userId, parsed.data);
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

  return {
    emit(input) {
      if (closed) return;
      const userIds = [...new Set(input.userIds.filter((id) => id.length > 0))];
      if (userIds.length === 0) return;

      const parsed = serverEventEnvelopeSchema.safeParse({
        resource: input.resource,
        id: input.id,
        change: input.change,
        organizationId: input.organizationId,
        snapshot: input.snapshot,
      });
      if (!parsed.success) {
        options.logger.error({ issues: parsed.error.issues }, "Dropped invalid Server event emit");
        return;
      }
      const envelope = parsed.data;
      const payload = JSON.stringify(envelope);

      for (const userId of userIds) {
        if (options.redis) {
          void options.redis
            .publish(`${CHANNEL_PREFIX}${userId}`, payload)
            .catch((err: unknown) => {
              options.logger.error({ err, userId }, "Server event Redis publish failed");
            });
        } else {
          deliverLocal(userId, envelope);
        }
      }
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
