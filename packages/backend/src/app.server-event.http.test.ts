import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@libsql/client";
import { serverEventEnvelopeSchema } from "@m5kdev/commons/modules/base/server-event.schema";
import { createBackendApp } from "./app";
import type { BetterAuth } from "./modules/auth/auth.lib";

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: {
    serialize: (value: unknown) => value,
    deserialize: (value: unknown) => value,
  },
}));

jest.mock("better-auth/node", () => ({
  toNodeHandler: () => () => undefined,
  fromNodeHeaders: (headers: unknown) => headers,
}));

const WEB_ORIGIN = "http://localhost:5173";

async function withServer(
  app: { listen: (port: number, host: string, cb: () => void) => Server },
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = await new Promise<Server>((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", () => {
      resolve(listening);
    });
    listening.on("error", reject);
  });

  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
}

function cookieFromSessionHeaders(headers: {
  get?: (name: string) => string | null;
  cookie?: string;
}): string {
  if (typeof headers.get === "function") {
    return headers.get("cookie") ?? "";
  }
  return headers.cookie ?? "";
}

function stubAuth(): BetterAuth {
  return {
    api: {
      getSession: async ({
        headers,
      }: {
        headers: { get?: (name: string) => string | null; cookie?: string };
      }) => {
        const cookie = cookieFromSessionHeaders(headers);
        const match = /session=([^;]+)/.exec(cookie);
        const userId = match?.[1];
        if (!userId) return null;
        return {
          user: { id: userId },
          session: { id: `session-${userId}`, userId },
        };
      },
    },
  } as unknown as BetterAuth;
}

function parseSseBlock(block: string): unknown | undefined {
  for (const line of block.split("\n")) {
    if (line.startsWith("data: ")) {
      return JSON.parse(line.slice(6)) as unknown;
    }
  }
  return undefined;
}

async function openSse(
  baseUrl: string,
  userId: string
): Promise<{
  response: Response;
  abort: AbortController;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  pullData: (count: number, timeoutMs?: number) => Promise<unknown[]>;
}> {
  const abort = new AbortController();
  const response = await fetch(`${baseUrl}/events`, {
    headers: { cookie: `session=${userId}` },
    signal: abort.signal,
  });
  if (!response.body) {
    throw new Error("SSE response has no body");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  const readUntil = async (
    predicate: (chunk: string) => boolean,
    timeoutMs: number
  ): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate(buf)) return;
      const remaining = deadline - Date.now();
      const result = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((resolve) => {
          setTimeout(() => resolve({ done: true, value: undefined }), remaining);
        }),
      ]);
      if (result.done) {
        if (predicate(buf)) return;
        throw new Error("SSE stream ended");
      }
      buf += decoder.decode(result.value, { stream: true });
    }
    throw new Error("Timed out waiting for SSE");
  };

  await readUntil((chunk) => chunk.includes(": ok"), 1500);

  const pullData = async (count: number, timeoutMs = 1500): Promise<unknown[]> => {
    const events: unknown[] = [];
    const deadline = Date.now() + timeoutMs;
    while (events.length < count && Date.now() < deadline) {
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const data = parseSseBlock(part);
        if (data !== undefined) events.push(data);
        if (events.length >= count) return events;
      }
      const remaining = deadline - Date.now();
      const result = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((resolve) => {
          setTimeout(() => resolve({ done: true, value: undefined }), remaining);
        }),
      ]);
      if (result.done) break;
      buf += decoder.decode(result.value, { stream: true });
    }
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const data = parseSseBlock(part);
      if (data !== undefined) events.push(data);
    }
    return events;
  };

  return { response, abort, reader, pullData };
}

describe("Kernel Server events HTTP", () => {
  const client = createClient({ url: ":memory:" });

  afterAll(async () => {
    await client.close?.();
  });

  it("rejects unauthenticated subscribe with 401 when Auth is registered", async () => {
    const built = createBackendApp({
      db: { client },
      app: { urls: { web: WEB_ORIGIN } },
      auth: { factory: () => stubAuth() },
    });

    await withServer(built.express.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/events`);
      expect(response.status).toBe(401);
    });
    built.serverEvents.close();
  });

  it("does not mount subscribe when Auth is not registered", async () => {
    const built = createBackendApp({
      db: { client },
      app: { urls: { web: WEB_ORIGIN } },
    });

    await withServer(built.express.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/events`);
      expect(response.status).toBe(404);
    });
    built.serverEvents.close();
  });

  it("delivers a created envelope with snapshot only to the addressed User", async () => {
    const built = createBackendApp({
      db: { client },
      app: { urls: { web: WEB_ORIGIN } },
      auth: { factory: () => stubAuth() },
    });

    await withServer(built.express.app, async (baseUrl) => {
      const userA = await openSse(baseUrl, "user-a");
      const userB = await openSse(baseUrl, "user-b");
      try {
        expect(userA.response.status).toBe(200);
        expect(userA.response.headers.get("content-type")).toContain("text/event-stream");

        built.serverEvents.emit({
          userIds: ["user-a", "user-a"],
          resource: "post",
          id: "post-1",
          change: "created",
          organizationId: "org-1",
          snapshot: { title: "Hello" },
        });
        built.serverEvents.emit({
          userIds: [],
          resource: "post",
          id: "ignored",
          change: "created",
          organizationId: null,
        });

        const received = await userA.pullData(1);
        expect(received).toHaveLength(1);
        expect(serverEventEnvelopeSchema.parse(received[0])).toEqual({
          resource: "post",
          id: "post-1",
          change: "created",
          organizationId: "org-1",
          snapshot: { title: "Hello" },
        });

        const leaked = await userB.pullData(1, 200);
        expect(leaked).toEqual([]);
      } finally {
        userA.abort.abort();
        userB.abort.abort();
        await userA.reader.cancel().catch(() => undefined);
        await userB.reader.cancel().catch(() => undefined);
      }
    });
    built.serverEvents.close();
  });

  it("delivers updated and deleted changes after comment frames", async () => {
    const built = createBackendApp({
      db: { client },
      app: { urls: { web: WEB_ORIGIN } },
      auth: { factory: () => stubAuth() },
    });

    await withServer(built.express.app, async (baseUrl) => {
      const stream = await openSse(baseUrl, "user-a");
      try {
        built.serverEvents.emit({
          userIds: ["user-a"],
          resource: "file",
          id: "file-1",
          change: "updated",
          organizationId: null,
        });
        built.serverEvents.emit({
          userIds: ["user-a"],
          resource: "file",
          id: "file-1",
          change: "deleted",
          organizationId: null,
        });

        const received = await stream.pullData(2);
        expect(received.map((event) => serverEventEnvelopeSchema.parse(event))).toEqual([
          {
            resource: "file",
            id: "file-1",
            change: "updated",
            organizationId: null,
          },
          {
            resource: "file",
            id: "file-1",
            change: "deleted",
            organizationId: null,
          },
        ]);
      } finally {
        stream.abort.abort();
        await stream.reader.cancel().catch(() => undefined);
      }
    });
    built.serverEvents.close();
  });
});
