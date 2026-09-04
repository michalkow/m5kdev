import { err, ok } from "neverthrow";
import { type ZodType, z } from "zod";
import { Base } from "../../base/base.abstract";
import type { OrganizationActor, UserActor } from "../../base/base.actor";
import type { ServerResultAsync } from "../../base/base.dto";
import type { AuthOrganizationRepository, AuthUserRepository } from "../auth/auth.repository";
import type { McpRepository } from "./mcp.repository";
import {
  LIST_ORGANIZATIONS_MCP_CALL,
  type McpCallDefinition,
  type McpCatalogEntry,
  type McpInvokeInput,
  type McpListedOrganization,
} from "./mcp.types";

const LIST_ORGANIZATIONS_DESCRIPTION =
  "List Organizations this MCP client may use. Call this before org-scoped MCP calls to learn organizationId values.";

function isMcpCallDefinition(value: unknown): value is McpCallDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    "mcpCall" in value &&
    (value as { mcpCall?: unknown }).mcpCall === true
  );
}

function isNeverthrowResult(
  value: unknown
): value is { isErr(): boolean; isOk(): boolean; error?: unknown; value?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { isErr?: unknown }).isErr === "function" &&
    typeof (value as { isOk?: unknown }).isOk === "function"
  );
}

export class McpService extends Base {
  private readonly calls = new Map<string, McpCallDefinition>();

  constructor(
    private readonly mcpRepository: McpRepository,
    private readonly organizationRepository: AuthOrganizationRepository,
    private readonly userRepository: AuthUserRepository
  ) {
    super("service");
  }

  description(description: string): McpCallDefinition {
    const definition = {
      mcpCall: true as const,
      description,
      inputSchema: z.object({}) as ZodType,
      _handler: undefined as McpCallDefinition["_handler"],
      input<TInput>(schema: ZodType<TInput>): McpCallDefinition<TInput> {
        const next = definition as unknown as McpCallDefinition<TInput>;
        next.inputSchema = schema;
        return next;
      },
      handle(handler: NonNullable<McpCallDefinition["_handler"]>): McpCallDefinition {
        definition._handler = handler;
        return definition;
      },
    };
    return definition;
  }

  registerService(service: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(service)) {
      if (!isMcpCallDefinition(value)) continue;
      if (key === LIST_ORGANIZATIONS_MCP_CALL) {
        throw new Error(
          `MCP call name "${key}" is reserved for the builtin list-organizations call`
        );
      }
      if (!value._handler) {
        throw new Error(`MCP call "${key}" (property "${key}") has no .handle() attached`);
      }
      if (this.calls.has(key)) {
        throw new Error(`already registered for MCP call "${key}"`);
      }
      this.calls.set(key, value);
    }
  }

  listCatalog(): McpCatalogEntry[] {
    const appCalls = [...this.calls.entries()].map(([name, definition]) => ({
      name,
      description: definition.description,
      requiresOrganizationId: true,
    }));
    return [
      {
        name: LIST_ORGANIZATIONS_MCP_CALL,
        description: LIST_ORGANIZATIONS_DESCRIPTION,
        requiresOrganizationId: false,
      },
      ...appCalls,
    ];
  }

  getCall(name: string): McpCallDefinition | undefined {
    return this.calls.get(name);
  }

  replaceAllowlist(input: {
    oauthClientId: string;
    userId: string;
    organizationIds: readonly string[];
  }): ServerResultAsync<void> {
    return this.mcpRepository.replaceAllowlist(input);
  }

  async listOrganizations({
    userId,
    oauthClientId,
  }: {
    userId: string;
    oauthClientId: string;
  }): ServerResultAsync<McpListedOrganization[]> {
    const userResult = await this.loadUser(userId);
    if (userResult.isErr()) return err(userResult.error);
    const idsResult = await this.mcpRepository.listOrganizationIds({ oauthClientId, userId });
    if (idsResult.isErr()) return err(idsResult.error);
    const listed: McpListedOrganization[] = [];
    for (const organizationId of idsResult.value) {
      const memberResult = await this.organizationRepository.findMemberByUserAndOrganization({
        userId,
        organizationId,
      });
      if (memberResult.isErr()) continue;
      if (!memberResult.value.userId) continue;
      const orgResult = await this.organizationRepository.findById(organizationId);
      if (orgResult.isErr()) return err(orgResult.error);
      if (!orgResult.value) continue;
      listed.push({
        id: organizationId,
        name: orgResult.value.name,
        organizationRole: memberResult.value.role,
      });
    }
    listed.sort((a, b) => a.name.localeCompare(b.name));
    return ok(listed);
  }

  async invoke(input: McpInvokeInput): ServerResultAsync<unknown> {
    if (input.name === LIST_ORGANIZATIONS_MCP_CALL) {
      return this.listOrganizations({
        userId: input.userId,
        oauthClientId: input.oauthClientId,
      });
    }

    const definition = this.calls.get(input.name);
    if (!definition?._handler) {
      return this.error("NOT_FOUND", `Unknown MCP call "${input.name}"`);
    }

    const organizationId = input.arguments.organizationId;
    if (typeof organizationId !== "string" || organizationId.length === 0) {
      return this.error("BAD_REQUEST", "organizationId is required");
    }

    const userResult = await this.loadUser(input.userId);
    if (userResult.isErr()) return err(userResult.error);

    const allowlisted = await this.mcpRepository.listOrganizationIds({
      oauthClientId: input.oauthClientId,
      userId: input.userId,
    });
    if (allowlisted.isErr()) return err(allowlisted.error);
    if (!allowlisted.value.includes(organizationId)) {
      return this.error("FORBIDDEN", "Organization is not on the MCP allowlist", {
        context: { reason: "allowlist" },
      });
    }

    const memberResult = await this.organizationRepository.findMemberByUserAndOrganization({
      userId: input.userId,
      organizationId,
    });
    if (memberResult.isErr()) {
      if (memberResult.error.code === "NOT_FOUND") {
        return this.error("NOT_FOUND", "Live Membership required", {
          context: { reason: "membership" },
        });
      }
      return err(memberResult.error);
    }
    if (!memberResult.value.userId) {
      return this.error("NOT_FOUND", "Live Membership required", {
        context: { reason: "membership" },
      });
    }

    const { organizationId: _stripped, ...domainArguments } = input.arguments;
    const parsed = definition.inputSchema.safeParse(domainArguments);
    if (!parsed.success) {
      return this.error("BAD_REQUEST", parsed.error.message);
    }

    const actor: OrganizationActor = {
      userId: input.userId,
      userRole: userResult.value.userRole,
      organizationId,
      organizationRole: memberResult.value.role,
      memberId: memberResult.value.id,
      teamId: null,
      teamRole: null,
    };

    try {
      const output = await definition._handler(parsed.data, actor);
      if (isNeverthrowResult(output)) {
        if (output.isErr()) return err(output.error as never);
        return ok(output.value);
      }
      return ok(output);
    } catch (cause) {
      return this.error(
        "INTERNAL_SERVER_ERROR",
        cause instanceof Error ? cause.message : undefined,
        {
          cause,
        }
      );
    }
  }

  private async loadUser(
    userId: string
  ): ServerResultAsync<{ userRole: string } & Pick<UserActor, "userId">> {
    const userResult = await this.userRepository.findById(userId);
    if (userResult.isErr()) return err(userResult.error);
    if (!userResult.value) return this.error("NOT_FOUND", "User not found");
    return ok({
      userId,
      userRole: userResult.value.role ?? "user",
    });
  }
}
