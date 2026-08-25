import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@libsql/client";
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

  it("delivers an untyped payload only to the addressed User", async () => {
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
          userId: "user-a",
          payload: { foo: 1, extra: true },
        });
        built.serverEvents.emit({
          userId: "",
          payload: { ignored: true },
        });

        const received = await userA.pullData(1);
        expect(received).toEqual([{ foo: 1, extra: true }]);

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

  it("batchEmits one payload to several Users and collapses duplicates", async () => {
    const built = createBackendApp({
      db: { client },
      app: { urls: { web: WEB_ORIGIN } },
      auth: { factory: () => stubAuth() },
    });

    await withServer(built.express.app, async (baseUrl) => {
      const userA = await openSse(baseUrl, "user-a");
      const userB = await openSse(baseUrl, "user-b");
      const userC = await openSse(baseUrl, "user-c");
      try {
        built.serverEvents.batchEmit({
          userIds: ["user-a", "user-b", "user-a"],
          payload: { id: "shared" },
        });

        expect(await userA.pullData(1)).toEqual([{ id: "shared" }]);
        expect(await userB.pullData(1)).toEqual([{ id: "shared" }]);

        const extraA = await userA.pullData(1, 200);
        expect(extraA).toEqual([]);

        const leaked = await userC.pullData(1, 200);
        expect(leaked).toEqual([]);
      } finally {
        userA.abort.abort();
        userB.abort.abort();
        userC.abort.abort();
        await userA.reader.cancel().catch(() => undefined);
        await userB.reader.cancel().catch(() => undefined);
        await userC.reader.cancel().catch(() => undefined);
      }
    });
    built.serverEvents.close();
  });

  it("does not deliver when batchEmit has no UserIds", async () => {
    const built = createBackendApp({
      db: { client },
      app: { urls: { web: WEB_ORIGIN } },
      auth: { factory: () => stubAuth() },
    });

    await withServer(built.express.app, async (baseUrl) => {
      const stream = await openSse(baseUrl, "user-a");
      try {
        built.serverEvents.batchEmit({
          userIds: [],
          payload: { ignored: true },
        });

        const received = await stream.pullData(1, 200);
        expect(received).toEqual([]);
      } finally {
        stream.abort.abort();
        await stream.reader.cancel().catch(() => undefined);
      }
    });
    built.serverEvents.close();
  });

  it("delivers successive untyped payloads after comment frames", async () => {
    const built = createBackendApp({
      db: { client },
      app: { urls: { web: WEB_ORIGIN } },
      auth: { factory: () => stubAuth() },
    });

    await withServer(built.express.app, async (baseUrl) => {
      const stream = await openSse(baseUrl, "user-a");
      try {
        built.serverEvents.emit({
          userId: "user-a",
          payload: { change: "updated" },
        });
        built.serverEvents.emit({
          userId: "user-a",
          payload: { change: "deleted" },
        });

        const received = await stream.pullData(2);
        expect(received).toEqual([{ change: "updated" }, { change: "deleted" }]);
      } finally {
        stream.abort.abort();
        await stream.reader.cancel().catch(() => undefined);
      }
    });
    built.serverEvents.close();
  });

  it("ends an open subscribe stream when the bus closes", async () => {
    const built = createBackendApp({
      db: { client },
      app: { urls: { web: WEB_ORIGIN } },
      auth: { factory: () => stubAuth() },
    });

    await withServer(built.express.app, async (baseUrl) => {
      const stream = await openSse(baseUrl, "user-a");
      try {
        built.serverEvents.close();
        const result = await stream.reader.read();
        expect(result.done).toBe(true);
      } finally {
        stream.abort.abort();
        await stream.reader.cancel().catch(() => undefined);
      }
    });
  });

  it("rejects subscribe with 503 after the bus has closed", async () => {
    const built = createBackendApp({
      db: { client },
      app: { urls: { web: WEB_ORIGIN } },
      auth: { factory: () => stubAuth() },
    });

    built.serverEvents.close();

    await withServer(built.express.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/events`, {
        headers: { cookie: "session=user-a" },
      });
      expect(response.status).toBe(503);
    });
  });
});
