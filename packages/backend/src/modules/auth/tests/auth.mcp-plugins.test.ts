import { createMcpOAuthPlugins } from "../auth.mcp-plugins";

jest.mock("better-auth/plugins", () => ({
  jwt: () => ({ id: "jwt" }),
}));

jest.mock("@better-auth/mcp", () => ({
  mcp: () => ({ id: "oauth-provider" }),
}));

jest.mock("@better-auth/cimd", () => ({
  cimd: () => ({ id: "cimd" }),
}));

jest.mock("@better-auth/cimd/node", () => ({
  fetchClientMetadataResource: async () => ({}),
}));

describe("createMcpOAuthPlugins", () => {
  it("omits jwt, mcp, and cimd when MCP is not configured", () => {
    expect(createMcpOAuthPlugins(undefined).map((plugin) => plugin.id)).toEqual([]);
  });

  it("registers jwt, mcp (as oauth-provider), and cimd when MCP is configured", () => {
    const plugins = createMcpOAuthPlugins({
      resource: "http://127.0.0.1:8080/mcp",
      loginPage: "http://localhost:5173/login",
      consentPage: "http://localhost:5173/consent",
    });
    expect(plugins.map((plugin) => plugin.id)).toEqual(["jwt", "oauth-provider", "cimd"]);
  });
});
