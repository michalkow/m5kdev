import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp as mcpPlugin } from "@better-auth/mcp";
import { jwt } from "better-auth/plugins";
import { fetchE2eMcpClientMetadata } from "../auth.mcp-e2e";
import { createMcpOAuthPlugins } from "../auth.mcp-plugins";

jest.mock("better-auth/plugins", () => ({
  jwt: jest.fn(() => ({ id: "jwt" })),
}));

jest.mock("@better-auth/mcp", () => ({
  mcp: jest.fn(() => ({ id: "oauth-provider" })),
}));

jest.mock("@better-auth/cimd", () => ({
  cimd: jest.fn(() => ({ id: "cimd" })),
}));

jest.mock("@better-auth/cimd/node", () => ({
  fetchClientMetadataResource: jest.fn(async () => ({})),
}));

const mcpConfig = {
  resource: "http://127.0.0.1:8080/mcp",
  loginPage: "http://localhost:5173/login",
  consentPage: "http://localhost:5173/consent",
};

describe("createMcpOAuthPlugins", () => {
  const previousFlag = process.env.M5K_MCP_E2E_CIMD;
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (previousFlag === undefined) {
      delete process.env.M5K_MCP_E2E_CIMD;
    } else {
      process.env.M5K_MCP_E2E_CIMD = previousFlag;
    }
    process.env.NODE_ENV = previousNodeEnv;
    jest.mocked(cimd).mockClear();
    jest.mocked(jwt).mockClear();
    jest.mocked(mcpPlugin).mockClear();
  });

  it("omits jwt, mcp, and cimd when MCP is not configured", () => {
    expect(createMcpOAuthPlugins(undefined).map((plugin) => plugin.id)).toEqual([]);
  });

  it("registers jwt, mcp (as oauth-provider), and cimd when MCP is configured", () => {
    delete process.env.M5K_MCP_E2E_CIMD;
    const plugins = createMcpOAuthPlugins(mcpConfig);
    expect(plugins.map((plugin) => plugin.id)).toEqual(["jwt", "oauth-provider", "cimd"]);
    expect(jwt).toHaveBeenCalledWith({
      disableSettingJwtHeader: true,
      schema: { jwks: { modelName: "jwk" } },
    });
    expect(mcpPlugin).toHaveBeenCalledWith({
      loginPage: mcpConfig.loginPage,
      consentPage: mcpConfig.consentPage,
      resource: mcpConfig.resource,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
    });
    expect(cimd).toHaveBeenCalledWith({
      fetchClientMetadataResource,
      metadataProfile: "mcp-2026-07-28",
    });
  });

  it("uses the in-process e2e CIMD fetch when the e2e flag is set", () => {
    process.env.M5K_MCP_E2E_CIMD = "1";
    process.env.NODE_ENV = "development";
    createMcpOAuthPlugins(mcpConfig);
    expect(cimd).toHaveBeenCalledWith({
      fetchClientMetadataResource: fetchE2eMcpClientMetadata,
      metadataProfile: "mcp-2026-07-28",
    });
  });
});
