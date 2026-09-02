import { type Client, createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { webhook } from "../webhook.db";
import { WebhookRepository } from "../webhook.repository";
import { WebhookService, type WebhookServiceConfig } from "../webhook.service";

const schema = { webhook };
const API_URL = "https://api.example.test";
const PROCESS_SECRET = "process-secret";

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

function createService(client: Client, config?: Partial<WebhookServiceConfig>): WebhookService {
  const orm = drizzle(client, { schema });
  const repository = new WebhookRepository({
    orm,
    schema,
    table: schema.webhook,
  });
  return new WebhookService({ webhook: repository }, undefined as never, {
    apiUrl: API_URL,
    mountPath: "/webhook",
    secrets: { clay: "clay-secret" },
    ...config,
    env: {
      WEBHOOK_SECRET: PROCESS_SECRET,
      ...config?.env,
    },
  });
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

describe("WebhookService.waitForRequest mint", () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await createTables(client);
  });

  afterEach(async () => {
    await client.close?.();
  });

  it("returns an error when an untyped wait has no WEBHOOK_SECRET", async () => {
    const service = createService(client, { env: { WEBHOOK_SECRET: undefined } });
    const result = await service.waitForRequest(async () => undefined);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("INTERNAL_SERVER_ERROR");
      expect(result.error.message).toBe("WEBHOOK_SECRET is not set");
    }
    const count = await client.execute("SELECT COUNT(*) AS n FROM webhook");
    expect(Number(count.rows[0]?.n ?? 0)).toBe(0);
  });

  it("returns an error when the name is not in module secrets", async () => {
    const service = createService(client);
    const result = await service.waitForRequest(async () => undefined, 60, { name: "missing" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("BAD_REQUEST");
    }
    const count = await client.execute("SELECT COUNT(*) AS n FROM webhook");
    expect(Number(count.rows[0]?.n ?? 0)).toBe(0);
  });

  it("mints an untyped callback URL from Kernel api URL with WEBHOOK_SECRET as token", async () => {
    const service = createService(client);
    let callbackUrl = "";
    const result = await service.waitForRequest<{ ok: boolean }>(async (url) => {
      callbackUrl = url;
      const { id } = parseCallbackUrl(url);
      const completed = await service.completed(id, { ok: true });
      expect(completed.isOk()).toBe(true);
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ ok: true });
    }
    expect(callbackUrl).toBe(
      `${API_URL}/webhook/${parseCallbackUrl(callbackUrl).id}?token=${PROCESS_SECRET}`
    );
  });

  it("embeds the named secret when name is set and secret is not", async () => {
    const service = createService(client);
    let callbackUrl = "";
    const result = await service.waitForRequest(
      async (url) => {
        callbackUrl = url;
        const { id } = parseCallbackUrl(url);
        await service.completed(id, { named: true });
      },
      60,
      { name: "clay" }
    );
    expect(result.isOk()).toBe(true);
    expect(parseCallbackUrl(callbackUrl).token).toBe("clay-secret");
    expect(callbackUrl.startsWith(`${API_URL}/webhook/`)).toBe(true);
  });

  it("embeds the row secret when secret is set even if name is also set", async () => {
    const service = createService(client);
    let callbackUrl = "";
    const result = await service.waitForRequest(
      async (url) => {
        callbackUrl = url;
        const { id } = parseCallbackUrl(url);
        await service.completed(id, { own: true });
      },
      60,
      { name: "clay", secret: "row-secret" }
    );
    expect(result.isOk()).toBe(true);
    expect(parseCallbackUrl(callbackUrl).token).toBe("row-secret");
  });

  it("prefers NGROK_LOCALHOST_TUNNEL over Kernel api URL", async () => {
    const service = createService(client, {
      env: { NGROK_LOCALHOST_TUNNEL: "https://tunnel.example.test/" },
    });
    let callbackUrl = "";
    const result = await service.waitForRequest(async (url) => {
      callbackUrl = url;
      const { id } = parseCallbackUrl(url);
      await service.completed(id, {});
    });
    expect(result.isOk()).toBe(true);
    expect(callbackUrl.startsWith("https://tunnel.example.test/webhook/")).toBe(true);
    expect(callbackUrl.includes("token=")).toBe(true);
  });

  it("returns a Result when the callback throws", async () => {
    const service = createService(client);
    const result = await service.waitForRequest(() => {
      throw new Error("side effect failed");
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("INTERNAL_SERVER_ERROR");
      expect(result.error.message).toBe("Error callback failed");
    }
  });

  it("returns CONFLICT when completing a non-waiting row", async () => {
    const service = createService(client);
    let waitId = "";
    const waited = service.waitForRequest(async (url) => {
      waitId = parseCallbackUrl(url).id;
      await service.completed(waitId, { first: true });
    });
    const first = await waited;
    expect(first.isOk()).toBe(true);
    const second = await service.completed(waitId, { second: true });
    expect(second.isErr()).toBe(true);
    if (second.isErr()) {
      expect(second.error.code).toBe("CONFLICT");
    }
  });

  it("rejects WEBHOOK_SECRET for a named wait", async () => {
    const service = createService(client);
    const result = await service.waitForRequest(
      async (url) => {
        const { id } = parseCallbackUrl(url);
        const unauthorized = await service.receive({
          id,
          token: PROCESS_SECRET,
          payload: { hacked: true },
        });
        expect(unauthorized.isErr()).toBe(true);
        if (unauthorized.isErr()) {
          expect(unauthorized.error.code).toBe("UNAUTHORIZED");
        }
        const authorized = await service.receive({
          id,
          token: "clay-secret",
          payload: { ok: true },
        });
        expect(authorized.isOk()).toBe(true);
      },
      60,
      { name: "clay" }
    );
    expect(result.isOk()).toBe(true);
  });

  it("returns GATEWAY_TIMEOUT as a Result when the wait expires", async () => {
    const service = createService(client);
    const result = await service.waitForRequest(async () => undefined, 0);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("GATEWAY_TIMEOUT");
    }
  });
});
