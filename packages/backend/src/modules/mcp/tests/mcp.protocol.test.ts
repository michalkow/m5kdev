import { err, ok } from "neverthrow";
import { z } from "zod";
import { ServerError } from "../../../utils/errors";
import { invokeMcpTool, mcpToolInputSchema } from "../mcp.protocol";

describe("MCP protocol adapter", () => {
  it("requires organizationId on app MCP call schemas and not on list-organizations", () => {
    const listSchema = mcpToolInputSchema({
      requiresOrganizationId: false,
    });
    expect(listSchema.safeParse({}).success).toBe(true);

    const announceSchema = mcpToolInputSchema(
      { requiresOrganizationId: true },
      { inputSchema: z.object({ title: z.string() }) }
    );
    expect(announceSchema.safeParse({ title: "Hello" }).success).toBe(false);
    expect(announceSchema.safeParse({ organizationId: "org-a", title: "Hello" }).success).toBe(
      true
    );
  });

  it("surfaces McpService errors as MCP tool errors and dispatches invoke", async () => {
    const invoke = jest.fn().mockResolvedValue(
      err(
        new ServerError({
          code: "FORBIDDEN",
          message: "Organization is not on the MCP allowlist",
        })
      )
    );
    const failed = await invokeMcpTool({
      invoke,
      userId: "user-1",
      oauthClientId: "oauth-cursor",
      name: "announce",
      arguments: { organizationId: "org-a", title: "Hello" },
    });
    expect(invoke).toHaveBeenCalledWith({
      userId: "user-1",
      oauthClientId: "oauth-cursor",
      name: "announce",
      arguments: { organizationId: "org-a", title: "Hello" },
    });
    expect(failed.isError).toBe(true);
    expect(failed.content).toEqual([
      { type: "text", text: "Organization is not on the MCP allowlist" },
    ]);

    invoke.mockResolvedValue(ok({ title: "Hello" }));
    const succeeded = await invokeMcpTool({
      invoke,
      userId: "user-1",
      oauthClientId: "oauth-cursor",
      name: "announce",
      arguments: { organizationId: "org-a", title: "Hello" },
    });
    expect(succeeded.isError).toBeUndefined();
    expect(succeeded.content).toEqual([{ type: "text", text: JSON.stringify({ title: "Hello" }) }]);
  });
});
