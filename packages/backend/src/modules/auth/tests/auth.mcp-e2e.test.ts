import {
  E2E_MCP_CIMD_CLIENT_ID,
  E2E_MCP_CIMD_CLIENT_NAME,
  E2E_MCP_CIMD_REDIRECT_URI,
  fetchE2eMcpClientMetadata,
  isE2eMcpCimdEnabled,
} from "../auth.mcp-e2e";

describe("e2e MCP CIMD fetch", () => {
  const previousFlag = process.env.M5K_MCP_E2E_CIMD;
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (previousFlag === undefined) {
      delete process.env.M5K_MCP_E2E_CIMD;
    } else {
      process.env.M5K_MCP_E2E_CIMD = previousFlag;
    }
    process.env.NODE_ENV = previousNodeEnv;
  });

  it("is enabled only for the e2e flag outside production", () => {
    process.env.M5K_MCP_E2E_CIMD = "1";
    process.env.NODE_ENV = "development";
    expect(isE2eMcpCimdEnabled()).toBe(true);

    process.env.NODE_ENV = "production";
    expect(isE2eMcpCimdEnabled()).toBe(false);

    process.env.NODE_ENV = "development";
    delete process.env.M5K_MCP_E2E_CIMD;
    expect(isE2eMcpCimdEnabled()).toBe(false);
  });

  it("serves the e2e CIMD document", async () => {
    const response = await fetchE2eMcpClientMetadata(E2E_MCP_CIMD_CLIENT_ID);
    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toMatch(/application\/json/i);

    const metadata: unknown = await response.json();
    expect(metadata).toEqual({
      client_id: E2E_MCP_CIMD_CLIENT_ID,
      client_name: E2E_MCP_CIMD_CLIENT_NAME,
      redirect_uris: [E2E_MCP_CIMD_REDIRECT_URI],
      token_endpoint_auth_method: "none",
    });
  });
});
