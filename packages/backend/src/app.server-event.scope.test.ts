import type { Response } from "express";
import type IORedis from "ioredis";
import type { Pool } from "pg";
import { createBackendApp } from "./app";
import { createTestPool } from "./test/postgresql";

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: { serialize: (value: unknown) => value, deserialize: (value: unknown) => value },
}));
jest.mock("better-auth/node", () => ({
  toNodeHandler: () => () => undefined,
  fromNodeHeaders: (headers: unknown) => headers,
}));

/** In-memory Redis pub/sub shared by every app built in a test (stands in for Upstash). */
function createSharedRedis() {
  const subscribers: { pattern: string; handlers: ((...args: string[]) => void)[] }[] = [];
  const client = (): IORedis => {
    const entry = { pattern: "", handlers: [] as ((...args: string[]) => void)[] };
    return {
      duplicate: () => client(),
      psubscribe: async (pattern: string) => {
        entry.pattern = pattern;
        subscribers.push(entry);
      },
      on: (event: string, handler: (...args: string[]) => void) => {
        if (event === "pmessage") entry.handlers.push(handler);
      },
      publish: async (channel: string, message: string) => {
        for (const subscriber of subscribers) {
          if (channel.startsWith(subscriber.pattern.replace(/\*$/, ""))) {
            for (const handler of subscriber.handlers)
              handler(subscriber.pattern, channel, message);
          }
        }
        return 1;
      },
      disconnect: () => undefined,
      quit: async () => "OK",
    } as unknown as IORedis;
  };
  return client();
}

function createStream() {
  const frames: string[] = [];
  const res = {
    writableEnded: false,
    status: () => res,
    setHeader: () => res,
    flushHeaders: () => undefined,
    write: (chunk: string) => {
      frames.push(chunk);
      return true;
    },
    on: () => res,
    end: () => undefined,
    req: { on: () => undefined },
  };
  return {
    res: res as unknown as Response,
    data: () => frames.filter((f) => f.startsWith("data:")),
  };
}

const urls = {
  VITE_APP_URL: "https://app.example.test",
  VITE_SERVER_URL: "https://api.example.test",
};

describe("Server event scope", () => {
  let client: Pool;
  beforeEach(() => {
    client = createTestPool();
  });
  afterEach(async () => {
    await client.end();
  });

  it("shares events between Canary and Production but not with Staging or another app", async () => {
    const redis = createSharedRedis();
    const build = (env: Record<string, string>) =>
      createBackendApp({
        db: { client },
        redis: { create: () => redis },
        env: { ...urls, ...env },
      });
    const canary = build({ APP_ENV: "canary", APP_SLUG: "editorial-desk" });
    const production = build({ APP_ENV: "production", APP_SLUG: "editorial-desk" });
    const staging = build({ APP_ENV: "staging", APP_SLUG: "editorial-desk" });
    const otherApp = build({ APP_ENV: "production", APP_SLUG: "other-app" });
    const streams = {
      production: createStream(),
      staging: createStream(),
      otherApp: createStream(),
    };
    production.serverEvents.attach({ userId: "user-1", res: streams.production.res });
    staging.serverEvents.attach({ userId: "user-1", res: streams.staging.res });
    otherApp.serverEvents.attach({ userId: "user-1", res: streams.otherApp.res });

    canary.serverEvents.emit({ userId: "user-1", payload: { resource: "post", id: "p1" } });
    await new Promise((resolve) => setImmediate(resolve));

    expect(streams.production.data()).toEqual([
      `data: ${JSON.stringify({ resource: "post", id: "p1" })}\n\n`,
    ]);
    expect(streams.staging.data()).toEqual([]);
    expect(streams.otherApp.data()).toEqual([]);
  });
});
