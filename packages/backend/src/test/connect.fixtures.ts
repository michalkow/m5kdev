import { request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { transformer } from "@m5kdev/commons/utils/trpc";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { createBackendApp } from "../app";
import * as authTables from "../modules/auth/auth.db";
import { createBetterAuth } from "../modules/auth/auth.lib";
import * as connectTables from "../modules/connect/connect.db";
import { ConnectModule } from "../modules/connect/connect.module";
import type { ConnectProvider } from "../modules/connect/connect.types";
import { experienceConfig, prepareExperienceTables } from "./experience.fixtures";
import { createTestPool } from "./postgresql";

const SECRET = "connection-http-test-secret-at-least-thirty-two-characters";
export const schema = { ...authTables, ...connectTables };

export async function connectionFixture(
  options: {
    topology?: "domain" | "shared" | "split" | "separate";
    provider?: ConnectProvider;
    mountPath?: string;
    legacy?: boolean;
    providerFailure?: "exchange" | "profile";
  } = {}
) {
  const mountPath = options.mountPath ?? "/connections";
  const callbackPath = `${mountPath.replace(/\/+$/, "")}/recording/callback`;
  const apiHost = (id: string) =>
    `${options.topology === "separate" ? `api-${id}` : options.topology === "shared" || (options.topology === "split" && id !== "radar") ? "api" : id}.example.test`;
  const pool = createTestPool();
  await prepareExperienceTables(pool, schema);
  const orm = drizzle(pool, { schema });
  const password = await hashPassword("Original-Password-123");
  for (const id of ["person", "other"]) {
    await orm
      .insert(authTables.users)
      .values({ id, name: id, email: `${id}@example.test`, emailVerified: true, role: "user" });
    await orm.insert(authTables.accounts).values({
      id: `credential-${id}`,
      providerId: "credential",
      accountId: id,
      userId: id,
      password,
    });
  }
  const exchanges: URLSearchParams[] = [];
  const fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input) !== "https://provider.example.test/token")
      throw new Error(`Unexpected external fetch ${String(input)}`);
    exchanges.push(new URLSearchParams(String(init?.body)));
    if (options.providerFailure === "exchange")
      return new Response(
        JSON.stringify({ error: "invalid_grant", error_description: "Provider technical details" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    return new Response(
      JSON.stringify({
        access_token: "recorded-access-token",
        refresh_token: "recorded-refresh-token",
        token_type: "Bearer",
        expires_in: 3600,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });
  const provider = {
    id: "recording",
    clientId: "recorded-client",
    clientSecret: "recorded-secret",
    scopes: ["read"],
    redirectUri: `https://radar.example.test${callbackPath}`,
    redirectUris: Object.fromEntries(
      ["radar", "horeka", "partner"].map((id) => [id, `https://${apiHost(id)}${callbackPath}`])
    ),
    issuerConfig: {
      issuer: "https://provider.example.test",
      authorization_endpoint: "https://provider.example.test/authorize",
      token_endpoint: "https://provider.example.test/token",
    },
    mapProfile: async () => {
      if (options.providerFailure === "profile") throw new Error("Provider profile unavailable");
      return {
        providerAccountId: "external-person",
        displayName: "External Person",
        accountType: "user" as const,
      };
    },
  };
  const selectedProvider = options.provider
    ? {
        ...options.provider,
        issuerUrl: undefined,
        issuerConfig: provider.issuerConfig,
        mapProfile: provider.mapProfile,
      }
    : provider;
  const built = await (async () => {
    try {
      return createBackendApp(
        {
          db: { client: pool },
          schema,
          app: options.legacy
            ? {
                name: "Legacy",
                urls: { web: "https://radar.example.test", api: "https://radar.example.test" },
              }
            : {
                experiences: {
                  ...experienceConfig,
                  definitions: Object.fromEntries(
                    Object.entries(experienceConfig.definitions).map(([id, definition]) => [
                      id,
                      {
                        ...definition,
                        apiOrigin: `https://${apiHost(id)}`,
                        ...(id === "radar"
                          ? { aliases: ["https://alias-radar.example.test"] }
                          : {}),
                      },
                    ])
                  ),
                },
              },
          experienceFlowSecret: SECRET,
          auth: {
            factory: ({ db, appConfig, experienceFlows }) =>
              createBetterAuth({
                orm: db.orm,
                schema,
                app: appConfig,
                experienceFlows,
                services: {},
                options: { secret: SECRET, rateLimit: { enabled: false } },
              }),
          },
        },
        [new ConnectModule([selectedProvider], { mountPath })]
      );
    } catch (error) {
      fetchSpy.mockRestore();
      await pool.end();
      throw error;
    }
  })();
  const server = await new Promise<Server>((resolve) => {
    const listening = built.express.app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const { port } = server.address() as AddressInfo;
  const visit = (
    host: string,
    path: string,
    options: { cookie?: string; origin?: string; method?: string; body?: unknown } = {}
  ) =>
    new Promise<Response>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port,
          path:
            path.startsWith("/trpc/") && options.body
              ? `${path}${path.includes("?") ? "&" : "?"}batch=1`
              : path,
          method: options.method ?? "GET",
          headers: {
            host,
            ...(options.cookie ? { cookie: options.cookie } : {}),
            ...(options.origin ? { origin: options.origin } : {}),
            ...(options.body ? { "content-type": "application/json" } : {}),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () =>
            resolve(
              new Response(Buffer.concat(chunks), {
                status: res.statusCode,
                headers: Object.fromEntries(
                  Object.entries(res.headers).map(([key, value]) => [
                    key,
                    Array.isArray(value) ? value.join(", ") : (value ?? ""),
                  ])
                ),
              })
            )
          );
        }
      );
      req.on("error", reject);
      req.end(
        options.body
          ? JSON.stringify(
              path.startsWith("/trpc/")
                ? { "0": transformer.serialize(options.body) }
                : options.body
            )
          : undefined
      );
    });
  const login = async (id: string, userId = "person") => {
    const response = await visit(apiHost(id), "/api/auth/sign-in/email", {
      method: "POST",
      origin: `https://${id}.example.test`,
      body: { email: `${userId}@example.test`, password: "Original-Password-123" },
    });
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
  };
  return {
    built,
    exchanges,
    visit,
    login,
    apiHost,
    close: async () => {
      fetchSpy.mockRestore();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
      await built.shutdown();
      await pool.end();
    },
  };
}

export const connectListPath = `/trpc/connect.list?input=${encodeURIComponent(JSON.stringify(transformer.serialize({})))}`;
export async function readConnectTRPC(response: Response) {
  const body = z.object({ result: z.object({ data: z.string() }) }).parse(await response.json());
  return { result: { data: transformer.deserialize(body.result.data) } };
}
