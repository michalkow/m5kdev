import { createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { drizzle } from "drizzle-orm/node-postgres";
import express from "express";
import { ok } from "neverthrow";
import { ExperienceRegistry } from "../../../experience";
import { experienceConfig, prepareExperienceTables } from "../../../test/experience.fixtures";
import { createTestPool } from "../../../test/postgresql";
import * as authTables from "../../auth/auth.db";
import { createBetterAuth } from "../../auth/auth.lib";
import * as oauthTables from "../../auth/auth.oauth.db";
import { createMcpExpressHandler } from "../mcp.http";

const RESOURCE = "https://radar.example.test/mcp";
const ISSUER = "https://radar.example.test/api/auth";

async function fixture() {
  const client = createTestPool();
  const schema = { ...authTables, ...oauthTables };
  await prepareExperienceTables(client, schema);
  const auth = createBetterAuth({
    orm: drizzle(client, { schema }),
    schema,
    services: {},
    app: {
      experienceRegistry: new ExperienceRegistry(experienceConfig),
      urls: { web: "https://radar.example.test", api: "https://radar.example.test" },
    },
    mcp: { resource: RESOURCE },
    options: {
      secret: "mcp-experience-secret-at-least-thirty-two-characters",
      rateLimit: { enabled: false },
    },
  });
  return { auth, close: () => client.end() };
}

async function protectedServer(auth: ReturnType<typeof createBetterAuth>) {
  const app = express();
  app.use(express.json());
  app.post(
    "/mcp",
    createMcpExpressHandler({
      auth,
      resource: RESOURCE,
      tools: [],
      serverName: "Canonical MCP",
      invoke: async () => ok(null),
    })
  );
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      ),
  };
}

describe("canonical MCP identity with dynamic auth domains", () => {
  it("signs framework tokens on another brand with the canonical issuer and advertised key", async () => {
    const f = await fixture();
    try {
      const api = f.auth.api as unknown as {
        signJWT(input: {
          headers: Headers;
          body: { payload: Record<string, unknown> };
        }): Promise<{ token: string }>;
      };
      const issued = await api.signJWT({
        headers: new Headers({
          host: "horeka.example.test",
          origin: "https://horeka.example.test",
        }),
        body: { payload: { sub: "person-1", aud: RESOURCE, client_id: "client-1" } },
      });
      const [header, payload, signature] = issued.token.split(".");
      expect(JSON.parse(Buffer.from(payload, "base64url").toString()).iss).toBe(ISSUER);
      const keySet = await f.auth.handler(new Request(`${ISSUER}/jwks`));
      const { keys } = await keySet.json();
      const { kid } = JSON.parse(Buffer.from(header, "base64url").toString());
      const key = keys.find((candidate: { kid: string }) => candidate.kid === kid);
      expect(
        verify(
          null,
          Buffer.from(`${header}.${payload}`),
          createPublicKey({ key, format: "jwk" }),
          Buffer.from(signature, "base64url")
        )
      ).toBe(true);
    } finally {
      await f.close();
    }
  });
  it("verifies token signatures, canonical issuer, audience and expiry before initializing MCP", async () => {
    const f = await fixture();
    const server = await protectedServer(f.auth);
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = { ...publicKey.export({ format: "jwk" }), kid: "experience-mcp", alg: "RS256" };
    const nativeFetch = globalThis.fetch;
    const jwksRequests: string[] = [];
    const fetchBoundary = jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url === `${ISSUER}/jwks`) {
          jwksRequests.push(url);
          return new Response(JSON.stringify({ keys: [jwk] }), {
            headers: { "content-type": "application/json" },
          });
        }
        return nativeFetch(input, init);
      });
    const token = (overrides: Record<string, unknown> = {}) => {
      const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "experience-mcp" })).toString(
        "base64url"
      );
      const payload = Buffer.from(
        JSON.stringify({
          iss: ISSUER,
          aud: RESOURCE,
          sub: "person-1",
          client_id: "client-1",
          exp: Math.floor(Date.now() / 1000) + 60,
          ...overrides,
        })
      ).toString("base64url");
      const signingInput = `${header}.${payload}`;
      return `${signingInput}.${sign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url")}`;
    };
    const initialize = (credential: string) =>
      fetch(server.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${credential}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "test", version: "1" },
          },
        }),
      });
    try {
      const allowed = await initialize(token());
      expect(allowed.status).toBe(200);
      expect(await allowed.text()).toContain("Canonical MCP");
      expect(jwksRequests).toEqual([`${ISSUER}/jwks`]);
      for (const credential of [
        token({ iss: "https://horeka.example.test/api/auth" }),
        token({ aud: "https://horeka.example.test/mcp" }),
        token({ exp: 1 }),
        `${token().split(".").slice(0, 2).join(".")}.AAAA`,
      ]) {
        const denied = await initialize(credential);
        expect(denied.status).toBe(401);
        expect(denied.headers.get("www-authenticate")).toContain(
          "https://radar.example.test/.well-known/oauth-protected-resource/mcp"
        );
      }
    } finally {
      fetchBoundary.mockRestore();
      await server.close();
      await f.close();
    }
  });
  it("returns a resource challenge instead of failing when dynamic auth has no global baseURL", async () => {
    const f = await fixture();
    const server = await protectedServer(f.auth);
    try {
      expect((await f.auth.$context).baseURL).toBe("");
      const response = await fetch(server.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain(
        "https://radar.example.test/.well-known/oauth-protected-resource/mcp"
      );
    } finally {
      await server.close();
      await f.close();
    }
  });
  it("keeps discovery on the canonical issuer and resource when requested through another brand", async () => {
    const f = await fixture();
    try {
      const metadata = await f.auth.handler(
        new Request("https://horeka.example.test/.well-known/oauth-authorization-server/api/auth")
      );
      expect(metadata.status).toBe(200);
      expect(await metadata.json()).toMatchObject({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/oauth2/authorize`,
        token_endpoint: `${ISSUER}/oauth2/token`,
        jwks_uri: `${ISSUER}/jwks`,
      });
      const protectedResource = await f.auth.handler(
        new Request("https://horeka.example.test/.well-known/oauth-protected-resource/mcp")
      );
      expect(await protectedResource.json()).toMatchObject({
        resource: RESOURCE,
        authorization_servers: [ISSUER],
      });
    } finally {
      await f.close();
    }
  });
});
