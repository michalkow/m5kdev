import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gunzipSync } from "node:zlib";
import express from "express";
import { createBackendApp, defineBackendModule } from "./app";
import { initPosthog, shutdownPosthog } from "./lib/posthog";
import { createTestPool } from "./test/postgresql";
import { captureServerError, ServerError } from "./utils/errors";

jest.mock("better-auth/node", () => ({
  toNodeHandler: jest.fn(),
  fromNodeHeaders: (headers: unknown) => headers,
}));

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: { serialize: (value: unknown) => value, deserialize: (value: unknown) => value },
}));

describe("Kernel HTTP error reporting", () => {
  it("reports raw Express 5xx failures once while preserving expected errors and responses", async () => {
    const realFetch = globalThis.fetch;
    const exceptions: Array<{ event: string; properties: Record<string, unknown> }> = [];
    jest.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
      if (!String(url).startsWith("https://posthog.test")) return realFetch(url, options);
      let body = Buffer.from(options?.body as string | Uint8Array);
      if (body[0] === 0x1f && body[1] === 0x8b) body = gunzipSync(body);
      exceptions.push(...JSON.parse(body.toString()).batch);
      return new Response("{}", { status: 200 });
    });
    const client = createTestPool();
    const app = express();
    app.set("env", "test");
    const built = createBackendApp({ db: { client }, express: app }, [
      defineBackendModule({
        id: "error-routes",
        express({ infra }) {
          infra.express.get("/raw", async () => {
            throw new Error("raw route failed");
          });
          infra.express.get("/expected", () => {
            throw Object.assign(new Error("denied"), { status: 403 });
          });
          infra.express.get("/response-status", (_req, res) => {
            res.status(409);
            throw new Error("conflict");
          });
          infra.express.get("/expected-server", () => {
            throw new ServerError({ code: "FORBIDDEN" });
          });
          infra.express.get("/captured", () => {
            const error = new ServerError({
              code: "INTERNAL_SERVER_ERROR",
              message: "captured route failed",
            });
            captureServerError(error, { logger: { error() {}, warn() {}, debug() {} } });
            throw error;
          });
        },
      }),
    ]);
    initPosthog({ apiKey: "phc_http", host: "https://posthog.test" });
    let server: Server | undefined;
    try {
      server = await new Promise<Server>((resolve) => {
        const listening = built.express.app.listen(0, "127.0.0.1", () => resolve(listening));
      });
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      expect((await realFetch(`${base}/raw`)).status).toBe(500);
      expect((await realFetch(`${base}/expected`)).status).toBe(403);
      expect((await realFetch(`${base}/expected-server`)).status).toBe(403);
      expect((await realFetch(`${base}/response-status`)).status).toBe(409);
      expect((await realFetch(`${base}/captured`)).status).toBe(500);
      await shutdownPosthog();
      expect(exceptions.filter((event) => event.event === "$exception")).toHaveLength(2);
      expect(JSON.stringify(exceptions)).toContain("raw route failed");
      expect(JSON.stringify(exceptions)).toContain("captured route failed");
      const values = exceptions.flatMap((event) =>
        (event.properties.$exception_list as Array<{ value: string }>).map(
          (exception) => exception.value
        )
      );
      expect(values).not.toContain("denied");
    } finally {
      await shutdownPosthog();
      if (server)
        await new Promise<void>((resolve, reject) =>
          server?.close((error) => (error ? reject(error) : resolve()))
        );
      await built.shutdown();
      await client.end();
      jest.restoreAllMocks();
    }
  });
});
