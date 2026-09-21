import type { AddressInfo } from "node:net";
import express, { type Express } from "express";
import {
  isCustomSchemeRedirectUri,
  mountMcpDcrNativeClientInterop,
  rewriteMcpDcrRedirects,
} from "../auth.mcp-dcr";
import type { McpDcrRestoreStore } from "../auth.mcp-dcr.repository";

describe("MCP DCR native-client rewrite", () => {
  it("detects custom-scheme redirect URIs", () => {
    expect(isCustomSchemeRedirectUri("cursor://anysphere.cursor-mcp/oauth/callback")).toBe(true);
    expect(isCustomSchemeRedirectUri("https://example.com/callback")).toBe(false);
    expect(isCustomSchemeRedirectUri("http://127.0.0.1/callback")).toBe(false);
    expect(isCustomSchemeRedirectUri("not a url")).toBe(false);
  });

  it("returns null when there are no custom-scheme redirects", () => {
    expect(
      rewriteMcpDcrRedirects({
        redirectUris: ["https://example.com/callback", "http://127.0.0.1/callback"],
      })
    ).toBeNull();
  });

  it("rewrites as native with http(s) registration URIs and restores custom schemes", () => {
    const rewrite = rewriteMcpDcrRedirects({
      redirectUris: [
        "https://example.com/callback",
        "cursor://anysphere.cursor-mcp/oauth/callback",
        "http://127.0.0.1/callback",
      ],
      softwareId: "cursor-software",
    });

    expect(rewrite).toEqual({
      applicationType: "native",
      registrationUris: ["https://example.com/callback", "http://127.0.0.1/callback"],
      restoredUris: [
        "https://example.com/callback",
        "http://127.0.0.1/callback",
        "cursor://anysphere.cursor-mcp/oauth/callback",
      ],
      softwareId: "cursor-software",
    });
  });

  it("uses a loopback placeholder when only custom-scheme redirects are present", () => {
    const rewrite = rewriteMcpDcrRedirects({
      redirectUris: ["cursor://anysphere.cursor-mcp/oauth/callback"],
    });

    expect(rewrite).not.toBeNull();
    expect(rewrite?.applicationType).toBe("native");
    expect(rewrite?.registrationUris).toEqual(["http://127.0.0.1/cursor-mcp-callback"]);
    expect(rewrite?.restoredUris).toEqual(["cursor://anysphere.cursor-mcp/oauth/callback"]);
    expect(rewrite?.softwareId).toMatch(/^cursor-mcp-/);
  });
});

describe("mountMcpDcrNativeClientInterop", () => {
  it("rewrites the register body before the next handler and restores on 201", async () => {
    const restore = jest.fn(async () => undefined);
    const result = await postOauthRegister({
      store: { restoreClientRedirectUrisBySoftwareId: restore },
      body: {
        redirect_uris: [
          "https://example.com/callback",
          "cursor://anysphere.cursor-mcp/oauth/callback",
        ],
        software_id: "cursor-software",
      },
    });

    expect(result.status).toBe(201);
    expect(result.seenBody).toEqual({
      redirect_uris: ["https://example.com/callback"],
      software_id: "cursor-software",
      application_type: "native",
    });
    expect(restore).toHaveBeenCalledWith({
      softwareId: "cursor-software",
      redirectUris: [
        "https://example.com/callback",
        "cursor://anysphere.cursor-mcp/oauth/callback",
      ],
    });
  });

  it("does not rewrite when there are no custom-scheme redirects", async () => {
    const restore = jest.fn(async () => undefined);
    const result = await postOauthRegister({
      store: { restoreClientRedirectUrisBySoftwareId: restore },
      body: {
        redirect_uris: ["https://example.com/callback"],
      },
    });

    expect(result.status).toBe(201);
    expect(result.seenBody).toEqual({
      redirect_uris: ["https://example.com/callback"],
    });
    expect(restore).not.toHaveBeenCalled();
  });
});

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function postOauthRegister(input: {
  store: McpDcrRestoreStore;
  body: unknown;
}): Promise<{ status: number; seenBody: Record<string, unknown> | undefined }> {
  const app = express();
  app.use(express.json());
  mountMcpDcrNativeClientInterop({ app, store: input.store });

  let seenBody: Record<string, unknown> | undefined;
  app.post("/api/auth/oauth2/register", (req, res) => {
    if (isJsonObject(req.body)) {
      seenBody = { ...req.body };
    }
    res.status(201).json({ client_id: "test-client" });
  });

  const response = await listenAndFetch({ app, body: input.body });
  return { status: response.status, seenBody };
}

async function listenAndFetch(input: { app: Express; body: unknown }): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const server = input.app.listen(0, "127.0.0.1", async () => {
      try {
        const address = server.address();
        if (!address || typeof address === "string") {
          throw new Error("expected TCP address");
        }
        const { port } = address satisfies AddressInfo;
        const response = await fetch(`http://127.0.0.1:${port}/api/auth/oauth2/register`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input.body),
        });
        await new Promise((r) => setTimeout(r, 20));
        resolve(response);
      } catch (error) {
        reject(error);
      } finally {
        server.close();
      }
    });
    server.on("error", reject);
  });
}
