import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { type Client, createClient } from "@libsql/client";
import type { Express } from "express";
import { createBackendApp } from "../../../app";
import * as webhookTables from "../webhook.db";
import { WebhookModule } from "../webhook.module";
import type { WebhookService } from "../webhook.service";

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

const PROCESS_SECRET = "process-secret";
const API_URL = "https://api.example.test";

async function createTables(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE webhook (
      id TEXT PRIMARY KEY NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER,
      timeout_sec INTEGER NOT NULL DEFAULT 60,
      status TEXT NOT NULL DEFAULT 'WAITING',
      error TEXT,
      payload TEXT,
      name TEXT,
      secret TEXT
    );
  `);
}

async function withServer(app: Express, run: (baseUrl: string) => Promise<void>): Promise<void> {
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

function parseCallbackUrl(url: string): { id: string; token: string } {
  const parsed = new URL(url);
  const id = parsed.pathname.split("/").filter(Boolean).pop();
  const token = parsed.searchParams.get("token");
  if (!id || !token) {
    throw new Error(`callback URL missing id or token: ${url}`);
  }
  return { id, token };
}

describe("Inbound callback HTTP", () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await createTables(client);
  });

  afterEach(async () => {
    await client.close?.();
  });

  it("completes an untyped wait from the query token and 409s a replay", async () => {
    const built = createBackendApp(
      {
        db: { client },
        schema: { ...webhookTables },
        app: { urls: { api: API_URL, web: "http://localhost:5173" } },
        env: { WEBHOOK_SECRET: PROCESS_SECRET },
      },
      [new WebhookModule("/hooks")] as const
    );
    const service = built.modules.webhook.services.webhook as WebhookService;

    await withServer(built.express.app, async (baseUrl) => {
      const result = await service.waitForRequest<{ ping: string }>(async (url) => {
        expect(url.startsWith(`${API_URL}/hooks/`)).toBe(true);
        const { id, token } = parseCallbackUrl(url);
        expect(token).toBe(PROCESS_SECRET);
        const posted = await fetch(`${baseUrl}/hooks/${id}?token=${token}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ping: "pong" }),
        });
        expect(posted.status).toBe(200);

        const replay = await fetch(`${baseUrl}/hooks/${id}?token=${token}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ping: "again" }),
        });
        expect(replay.status).toBe(409);
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({ ping: "pong" });
      }
    });
  });

  it("uses Bearer when present and ignores a matching query token", async () => {
    const built = createBackendApp(
      {
        db: { client },
        schema: { ...webhookTables },
        app: { urls: { api: API_URL, web: "http://localhost:5173" } },
        env: { WEBHOOK_SECRET: PROCESS_SECRET },
      },
      [new WebhookModule()] as const
    );
    const service = built.modules.webhook.services.webhook as WebhookService;

    await withServer(built.express.app, async (baseUrl) => {
      const result = await service.waitForRequest(async (url) => {
        const { id, token } = parseCallbackUrl(url);
        const denied = await fetch(`${baseUrl}/webhook/${id}?token=${token}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer wrong",
          },
          body: JSON.stringify({ ping: "no" }),
        });
        expect(denied.status).toBe(401);

        const posted = await fetch(`${baseUrl}/webhook/${id}?token=wrong`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ ping: "yes" }),
        });
        expect(posted.status).toBe(200);
      });
      expect(result.isOk()).toBe(true);
    });
  });

  it("falls back to the query token when Authorization is not Bearer", async () => {
    const built = createBackendApp(
      {
        db: { client },
        schema: { ...webhookTables },
        app: { urls: { api: API_URL, web: "http://localhost:5173" } },
        env: { WEBHOOK_SECRET: PROCESS_SECRET },
      },
      [new WebhookModule()] as const
    );
    const service = built.modules.webhook.services.webhook as WebhookService;

    await withServer(built.express.app, async (baseUrl) => {
      const result = await service.waitForRequest(async (url) => {
        const { id, token } = parseCallbackUrl(url);
        const posted = await fetch(`${baseUrl}/webhook/${id}?token=${token}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Basic ignore-me",
          },
          body: JSON.stringify({ ping: "yes" }),
        });
        expect(posted.status).toBe(200);
      });
      expect(result.isOk()).toBe(true);
    });
  });

  it("returns 401 for a missing row even with WEBHOOK_SECRET", async () => {
    const built = createBackendApp(
      {
        db: { client },
        schema: { ...webhookTables },
        app: { urls: { api: API_URL, web: "http://localhost:5173" } },
        env: { WEBHOOK_SECRET: PROCESS_SECRET },
      },
      [new WebhookModule()] as const
    );

    await withServer(built.express.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/webhook/missing-id?token=${PROCESS_SECRET}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(401);
    });
  });
});
