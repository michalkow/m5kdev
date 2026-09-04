import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("CLI Backend Module feature catalog", () => {
  const prepareTemplates = readFileSync(
    join(__dirname, "../../scripts/prepare-templates.ts"),
    "utf8"
  );

  it("does not offer access, crypto, documents, social, or clay", () => {
    expect(prepareTemplates).not.toMatch(/^\s+access:/m);
    expect(prepareTemplates).not.toMatch(/^\s+crypto:/m);
    expect(prepareTemplates).not.toMatch(/^\s+documents:/m);
    expect(prepareTemplates).not.toMatch(/^\s+social:/m);
    expect(prepareTemplates).not.toMatch(/^\s+clay:/m);
  });

  it("still offers Core optional-registration flags", () => {
    const ids = [
      "billing",
      "files",
      "workflows",
      "ai",
      "notifications",
      "mcp",
      "tags",
      "connect",
      "webhook",
      "recurrence",
    ];
    for (const id of ids) {
      expect(prepareTemplates).toMatch(new RegExp(`^\\s+${id}:`, "m"));
    }
  });
});

describe("McpModule docs", () => {
  it("covers the MCP call builder, allowlist, and omit-to-disable", () => {
    const mcpDocs = readFileSync(
      join(__dirname, "../../../../apps/docs/docs/modules/mcp/index.md"),
      "utf8"
    );
    expect(mcpDocs).toMatch(/list-organizations/);
    expect(mcpDocs).toMatch(/organizationId/);
    expect(mcpDocs).toMatch(/MCP allowlist/);
    expect(mcpDocs).toMatch(/re-consent/);
    expect(mcpDocs).toMatch(/omit/i);
    expect(mcpDocs).toMatch(/Better Auth MCP OAuth/);
    expect(mcpDocs).toMatch(/API keys/);
    expect(mcpDocs).toMatch(/\bGrant/);
    expect(mcpDocs).not.toMatch(/trpc-mcp/);
    expect(mcpDocs).not.toMatch(/wrap(?:ping)? tRPC/i);
  });

  it("lists McpModule as Core and documents the create-m5kdev flag as default off", () => {
    const modulesIndex = readFileSync(
      join(__dirname, "../../../../apps/docs/docs/modules/index.md"),
      "utf8"
    );
    const cliDocs = readFileSync(
      join(__dirname, "../../../../apps/docs/docs/packages/cli.md"),
      "utf8"
    );
    expect(modulesIndex).toMatch(/\[McpModule\]\(\/modules\/mcp\)/);
    expect(modulesIndex).not.toMatch(/trpc-mcp/);
    expect(cliDocs).toMatch(/`mcp`/);
    expect(cliDocs).toMatch(/default off/i);
  });
});
