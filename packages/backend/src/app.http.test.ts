import fs from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { type Client, createClient } from "@libsql/client";
import express, { type Express } from "express";
import { createBackendApp, defineBackendModule } from "./app";
import type { AuthMiddleware } from "./modules/auth/auth.middleware";
import { createBillingRouter } from "./modules/billing/billing.router";
import type { BillingService } from "./modules/billing/billing.service";

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: {
    serialize: (value: unknown) => value,
    deserialize: (value: unknown) => value,
  },
}));

jest.mock("better-auth/node", () => ({
  toNodeHandler:
    () =>
    (
      req: {
        readableEnded?: boolean;
        on: (event: string, listener: (chunk?: Buffer | string) => void) => void;
      },
      res: {
        statusCode: number;
        setHeader: (name: string, value: string) => void;
        end: (body: Buffer) => void;
      }
    ) => {
      const finish = (chunks: Buffer[]): void => {
        res.statusCode = 200;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end(Buffer.concat(chunks));
      };
      if (req.readableEnded) {
        finish([]);
        return;
      }
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
      });
      req.on("end", () => {
        finish(chunks);
      });
    },
  fromNodeHeaders: (headers: unknown) => headers,
}));

const WEB_ORIGIN = "http://localhost:5173";

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

describe("createBackendApp HTTP shell", () => {
  let client: Client;

  beforeEach(() => {
    client = createClient({ url: ":memory:" });
  });

  afterEach(async () => {
    await client.close?.();
  });

  it("allows credentialed CORS from the app web URL", async () => {
    const built = createBackendApp({
      db: { client },
      app: { urls: { web: WEB_ORIGIN } },
    });
    built.express.app.get("/ping", (_req, res) => {
      res.json({ ok: true });
    });

    await withServer(built.express.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/ping`, {
        headers: { Origin: WEB_ORIGIN },
      });
      expect(response.headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN);
      expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    });
  });

  it("allows the library CORS headers on preflight", async () => {
    const built = createBackendApp({
      db: { client },
      app: { urls: { web: WEB_ORIGIN } },
    });

    await withServer(built.express.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/ping`, {
        method: "OPTIONS",
        headers: {
          Origin: WEB_ORIGIN,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers":
            "content-type,authorization,waitlist-invitation-code,organization-invitation-code,admin-create-verified-user,user-locale,user-price-id,x-not-a-library-header",
        },
      });
      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN);
      const allowed = (response.headers.get("access-control-allow-headers") ?? "").toLowerCase();
      expect(allowed).toContain("content-type");
      expect(allowed).toContain("authorization");
      expect(allowed).toContain("waitlist-invitation-code");
      expect(allowed).toContain("organization-invitation-code");
      expect(allowed).toContain("admin-create-verified-user");
      expect(allowed).toContain("user-locale");
      expect(allowed).toContain("user-price-id");
      expect(allowed).not.toContain("x-not-a-library-header");
    });
  });

  it("parses JSON request bodies", async () => {
    const built = createBackendApp({
      db: { client },
      app: { urls: { web: WEB_ORIGIN } },
    });
    built.express.app.post("/echo", (req, res) => {
      res.json(req.body);
    });

    await withServer(built.express.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/echo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN },
        body: JSON.stringify({ hello: "kernel" }),
      });
      expect(await response.json()).toEqual({ hello: "kernel" });
    });
  });

  it("leaves POST /stripe/webhook as a Buffer for Stripe signature verification", async () => {
    const payload = JSON.stringify({
      id: "evt_test",
      object: "event",
      type: "customer.subscription.updated",
    });
    const built = createBackendApp(
      {
        db: { client },
        app: { urls: { web: WEB_ORIGIN } },
      },
      [
        defineBackendModule({
          id: "probe",
          express({ infra }) {
            const router = express.Router();
            router.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
              const body = req.body as unknown;
              res.json({
                isBuffer: Buffer.isBuffer(body),
                isParsedObject: typeof body === "object" && body !== null && !Buffer.isBuffer(body),
                utf8: Buffer.isBuffer(body) ? body.toString("utf8") : null,
              });
            });
            infra.express.use("/stripe", router);
          },
        }),
      ]
    );

    await withServer(built.express.app, async (baseUrl) => {
      const signed = await fetch(`${baseUrl}/stripe/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Stripe-Signature": "t=1,v1=test",
          Origin: WEB_ORIGIN,
        },
        body: payload,
      });
      expect(signed.status).toBe(200);
      expect(await signed.json()).toEqual({
        isBuffer: true,
        isParsedObject: false,
        utf8: payload,
      });

      const withQuery = await fetch(`${baseUrl}/stripe/webhook?livemode=true`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": "t=1,v1=test",
        },
        body: payload,
      });
      expect(await withQuery.json()).toEqual({
        isBuffer: true,
        isParsedObject: false,
        utf8: payload,
      });
    });
  });

  it("does not feed Stripe constructEvent a parsed JSON object", async () => {
    const payload = JSON.stringify({ id: "evt_test", type: "invoice.paid" });
    const constructEvent = jest.fn((body: unknown) => {
      if (!Buffer.isBuffer(body) && typeof body !== "string") {
        return {
          isErr: () => true as const,
          error: {
            message:
              "Webhook payload must be provided as a string or a Buffer. Payload was provided as a parsed JavaScript object instead.",
          },
        };
      }
      return { isErr: () => false as const, value: { id: "evt_test" } };
    });
    const processEvent = jest.fn(async () => ({ isErr: () => false as const, value: true }));
    const authMiddleware: AuthMiddleware = (_req, _res, next) => next();
    const built = createBackendApp({
      db: { client },
      app: { urls: { web: WEB_ORIGIN } },
    });
    built.express.app.use(
      "/stripe",
      createBillingRouter(authMiddleware, {
        constructEvent,
        processEvent,
      } as unknown as BillingService)
    );

    await withServer(built.express.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/stripe/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": "t=1,v1=test",
        },
        body: payload,
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ received: true });
      expect(constructEvent).toHaveBeenCalledTimes(1);
      const [body, signature] = constructEvent.mock.calls[0] ?? [];
      expect(Buffer.isBuffer(body)).toBe(true);
      expect(Buffer.isBuffer(body) ? body.toString("utf8") : body).toBe(payload);
      expect(signature).toBe("t=1,v1=test");
      expect(processEvent).toHaveBeenCalledWith({ id: "evt_test" });
    });
  });

  it("leaves the Better Auth request stream unconsumed", async () => {
    const built = createBackendApp({
      db: { client },
      auth: {
        factory: () => ({}) as never,
      },
    });

    await withServer(built.express.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/sign-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"email":"user@example.test"}',
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('{"email":"user@example.test"}');
    });
  });

  it("rewrites MCP DCR native-client register JSON on the Auth stream", async () => {
    const built = createBackendApp(
      {
        db: { client },
        auth: {
          factory: () => ({}) as never,
        },
      },
      [defineBackendModule({ id: "mcp" })]
    );

    await withServer(built.express.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/oauth2/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: [
            "https://example.com/callback",
            "cursor://anysphere.cursor-mcp/oauth/callback",
          ],
          software_id: "cursor-software",
        }),
      });
      expect(response.status).toBe(200);
      expect(JSON.parse(await response.text())).toEqual({
        redirect_uris: ["https://example.com/callback"],
        software_id: "cursor-software",
        application_type: "native",
      });
    });
  });

  it("lets a CORS map add an extra origin", async () => {
    const extraOrigin = "http://preview.example";
    const built = createBackendApp({
      db: { client },
      app: { urls: { web: WEB_ORIGIN } },
      cors: (defaults) => ({
        ...defaults,
        origin: [extraOrigin, ...(Array.isArray(defaults.origin) ? defaults.origin : [])],
      }),
    });
    built.express.app.get("/ping", (_req, res) => {
      res.json({ ok: true });
    });

    await withServer(built.express.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/ping`, {
        headers: { Origin: extraOrigin },
      });
      expect(response.headers.get("access-control-allow-origin")).toBe(extraOrigin);
    });
  });

  it("lets a CORS map drop a default allowed header", async () => {
    const built = createBackendApp({
      db: { client },
      app: { urls: { web: WEB_ORIGIN } },
      cors: (defaults) => ({
        ...defaults,
        allowedHeaders: ["Content-Type", "Authorization"],
      }),
    });

    await withServer(built.express.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/ping`, {
        method: "OPTIONS",
        headers: {
          Origin: WEB_ORIGIN,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type,user-locale",
        },
      });
      const allowed = (response.headers.get("access-control-allow-headers") ?? "").toLowerCase();
      expect(allowed).toContain("content-type");
      expect(allowed).not.toContain("user-locale");
    });
  });

  it("does not reflect Origin when no web URL is configured", async () => {
    const built = createBackendApp({
      db: { client },
      env: { VITE_APP_URL: undefined },
    });
    built.express.app.get("/ping", (_req, res) => {
      res.json({ ok: true });
    });

    await withServer(built.express.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/ping`, {
        headers: { Origin: WEB_ORIGIN },
      });
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });
  });

  it("applies JSON and CORS onto a passed Express app after caller middleware", async () => {
    const expressApp = express();
    expressApp.use((_req, res, next) => {
      res.setHeader("X-Caller", "1");
      next();
    });
    const built = createBackendApp({
      db: { client },
      express: expressApp,
      app: { urls: { web: WEB_ORIGIN } },
    });
    built.express.app.get("/ping", (_req, res) => {
      res.json({ ok: true });
    });

    await withServer(built.express.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/ping`, {
        headers: { Origin: WEB_ORIGIN },
      });
      expect(response.headers.get("x-caller")).toBe("1");
      expect(response.headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN);
    });
  });

  it("lets a JSON map lower the body size limit", async () => {
    const built = createBackendApp({
      db: { client },
      app: { urls: { web: WEB_ORIGIN } },
      json: (defaults) => ({
        ...defaults,
        limit: 4,
      }),
    });
    built.express.app.post("/echo", (req, res) => {
      res.json(req.body);
    });

    await withServer(built.express.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/echo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN },
        body: JSON.stringify({ hello: "kernel" }),
      });
      expect(response.status).toBe(413);
    });
  });

  describe("baked SPA", () => {
    let spaRoot: string;

    beforeEach(async () => {
      spaRoot = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-spa-"));
      await fs.writeFile(path.join(spaRoot, "index.html"), "<!doctype html><title>baked</title>");
    });

    afterEach(async () => {
      await fs.rm(spaRoot, { recursive: true, force: true });
    });

    it("serves index.html for GET / when spa.root exists", async () => {
      const built = createBackendApp({
        db: { client },
        spa: { root: spaRoot },
      });

      await withServer(built.express.app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/`);
        expect(response.status).toBe(200);
        expect(await response.text()).toContain("<title>baked</title>");
      });
    });

    it("serves index.html for a client-side route", async () => {
      const built = createBackendApp({
        db: { client },
        spa: { root: spaRoot },
      });

      await withServer(built.express.app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/posts/abc`);
        expect(response.status).toBe(200);
        expect(await response.text()).toContain("<title>baked</title>");
      });
    });

    it("does not 500 when spa.root is missing and still serves API routes", async () => {
      const built = createBackendApp(
        {
          db: { client },
          spa: { root: path.join(spaRoot, "does-not-exist") },
        },
        [
          defineBackendModule({
            id: "probe",
            express({ infra }) {
              infra.express.get("/trpc/health", (_req, res) => {
                res.json({ ok: true });
              });
            },
          }),
        ]
      );

      await withServer(built.express.app, async (baseUrl) => {
        const missing = await fetch(`${baseUrl}/`);
        expect(missing.status).toBe(404);
        const api = await fetch(`${baseUrl}/trpc/health`);
        expect(api.status).toBe(200);
        expect(await api.json()).toEqual({ ok: true });
      });
    });

    it("does not replace tRPC or auth routes with the SPA fallback", async () => {
      const built = createBackendApp(
        {
          db: { client },
          spa: { root: spaRoot },
        },
        [
          defineBackendModule({
            id: "probe",
            express({ infra }) {
              infra.express.get("/trpc/health", (_req, res) => {
                res.json({ ok: true });
              });
              infra.express.post("/api/auth/session", (_req, res) => {
                res.json({ session: true });
              });
            },
          }),
        ]
      );

      await withServer(built.express.app, async (baseUrl) => {
        const trpc = await fetch(`${baseUrl}/trpc/health`);
        expect(await trpc.json()).toEqual({ ok: true });
        const auth = await fetch(`${baseUrl}/api/auth/session`, { method: "POST" });
        expect(await auth.json()).toEqual({ session: true });
      });
    });

    it("does not mount static files when spa is omitted", async () => {
      const built = createBackendApp({
        db: { client },
      });

      await withServer(built.express.app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/`);
        expect(response.status).toBe(404);
      });
    });
  });
});
