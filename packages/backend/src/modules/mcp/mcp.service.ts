import { err, ok } from "neverthrow";
import { Base } from "../../base/base.abstract";
import type { OrganizationActor, UserActor } from "../../base/base.actor";
import type { ServerResultAsync } from "../../base/base.dto";
import type { AuthOrganizationRepository, AuthUserRepository } from "../auth/auth.repository";
import type { McpRepository } from "./mcp.repository";
import {
  LIST_ORGANIZATIONS_MCP_CALL,
  type McpCatalogEntry,
  type McpConsentOrganization,
  type McpInvokeInput,
  type McpListedOrganization,
  type McpOrganizationCallDefinition,
  type McpRegisterCallsOptions,
  type McpRegisteredCall,
  type McpUserCallDefinition,
} from "./mcp.types";

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

function isUnfinishedCallBuilder(value: object): boolean {
  return "input" in value && typeof (value as { input?: unknown }).input === "function";
}

function reservedNameError(name: string): Error {
  return new Error(`MCP call name "${name}" is reserved for the builtin list-organizations call`);
}

function duplicateNameError(name: string): Error {
  return new Error(`already registered for MCP call "${name}"`);
}

function missingHandleError(name: string): Error {
  return new Error(`MCP call "${name}" (property "${name}") has no .handle() attached`);
}

export class McpService extends Base {
  private readonly organizationCalls = new Map<string, McpOrganizationCallDefinition>();
  private readonly userCalls = new Map<string, McpUserCallDefinition>();

  constructor(
    private readonly mcpRepository: McpRepository,
    private readonly organizationRepository: AuthOrganizationRepository,
    private readonly userRepository: AuthUserRepository
  ) {
    super("service");
  }

  registerOrganizationCalls(calls: Record<string, unknown>): void {
    for (const [name, value] of Object.entries(calls)) {
      if (name === LIST_ORGANIZATIONS_MCP_CALL) {
        throw reservedNameError(name);
      }
      this.assertAvailableName(name);
      this.organizationCalls.set(name, this.readOrganizationCall(name, value));
    }
  }

  registerUserCalls(calls: Record<string, unknown>, options: McpRegisterCallsOptions = {}): void {
    for (const [name, value] of Object.entries(calls)) {
      if (name === LIST_ORGANIZATIONS_MCP_CALL && options.moduleId && options.moduleId !== "mcp") {
        throw reservedNameError(name);
      }
      this.assertAvailableName(name);
      this.userCalls.set(name, this.readUserCall(name, value));
    }
  }

  listCatalog(): McpCatalogEntry[] {
    const userEntries = [...this.userCalls.entries()].map(([name, definition]) => ({
      name,
      description: definition.description,
      requiresOrganizationId: false,
    }));
    const reserved = userEntries.filter((entry) => entry.name === LIST_ORGANIZATIONS_MCP_CALL);
    const otherUser = userEntries.filter((entry) => entry.name !== LIST_ORGANIZATIONS_MCP_CALL);
    const organizationEntries = [...this.organizationCalls.entries()].map(([name, definition]) => ({
      name,
      description: definition.description,
      requiresOrganizationId: true,
    }));
    return [...reserved, ...otherUser, ...organizationEntries];
  }

  getCall(name: string): McpRegisteredCall | undefined {
    return this.userCalls.get(name) ?? this.organizationCalls.get(name);
  }

  replaceAllowlist(input: {
    oauthClientId: string;
    userId: string;
    organizationIds: readonly string[];
  }): ServerResultAsync<void> {
    return this.mcpRepository.replaceAllowlist(input);
  }

  async listConsentOrganizations({
    userId,
    oauthClientId,
  }: {
    userId: string;
    oauthClientId: string;
  }): ServerResultAsync<McpConsentOrganization[]> {
    const userResult = await this.loadUser(userId);
    if (userResult.isErr()) return err(userResult.error);
    const liveResult = await this.organizationRepository.listUserOrganizations(userId);
    if (liveResult.isErr()) return err(liveResult.error);
    const allowlistedResult = await this.mcpRepository.listOrganizationIds({
      oauthClientId,
      userId,
    });
    if (allowlistedResult.isErr()) return err(allowlistedResult.error);
    const allowlisted = new Set(allowlistedResult.value);
    const listed = liveResult.value.map((organization) => ({
      id: organization.id,
      name: organization.name,
      allowlisted: allowlisted.has(organization.id),
    }));
    listed.sort((a, b) => a.name.localeCompare(b.name));
    return ok(listed);
  }

  async replaceConsentAllowlist(input: {
    oauthClientId: string;
    userId: string;
    organizationIds: readonly string[];
  }): ServerResultAsync<void> {
    const liveResult = await this.organizationRepository.listUserOrganizations(input.userId);
    if (liveResult.isErr()) return err(liveResult.error);
    const liveIds = new Set(liveResult.value.map((organization) => organization.id));
    return this.replaceAllowlist({
      oauthClientId: input.oauthClientId,
      userId: input.userId,
      organizationIds: input.organizationIds.filter((organizationId) =>
        liveIds.has(organizationId)
      ),
    });
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
    const userDefinition = this.userCalls.get(input.name);
    if (userDefinition) {
      return this.invokeUserCall(userDefinition, input);
    }
    const organizationDefinition = this.organizationCalls.get(input.name);
    if (organizationDefinition) {
      return this.invokeOrganizationCall(organizationDefinition, input);
    }
    return this.error("NOT_FOUND", `Unknown MCP call "${input.name}"`);
  }

  private assertAvailableName(name: string): void {
    if (this.organizationCalls.has(name) || this.userCalls.has(name)) {
      throw duplicateNameError(name);
    }
  }

  private readOrganizationCall(name: string, value: unknown): McpOrganizationCallDefinition {
    if (typeof value !== "object" || value === null) {
      throw new Error(`MCP call "${name}" is not a defineMcpCall() definition`);
    }
    if (isUnfinishedCallBuilder(value)) {
      throw missingHandleError(name);
    }
    if (
      (value as { scope?: unknown }).scope !== "organization" ||
      typeof (value as { handle?: unknown }).handle !== "function" ||
      typeof (value as { description?: unknown }).description !== "string"
    ) {
      throw new Error(`MCP call "${name}" is not a defineMcpCall() definition`);
    }
    return value as McpOrganizationCallDefinition;
  }

  private readUserCall(name: string, value: unknown): McpUserCallDefinition {
    if (typeof value !== "object" || value === null) {
      throw new Error(`MCP call "${name}" is not a defineUserMcpCall() definition`);
    }
    if (isUnfinishedCallBuilder(value)) {
      throw missingHandleError(name);
    }
    if (
      (value as { scope?: unknown }).scope !== "user" ||
      typeof (value as { handle?: unknown }).handle !== "function" ||
      typeof (value as { description?: unknown }).description !== "string"
    ) {
      throw new Error(`MCP call "${name}" is not a defineUserMcpCall() definition`);
    }
    return value as McpUserCallDefinition;
  }

  private async invokeUserCall(
    definition: McpUserCallDefinition,
    input: McpInvokeInput
  ): ServerResultAsync<unknown> {
    const userResult = await this.loadUser(input.userId);
    if (userResult.isErr()) return err(userResult.error);

    const parsed = definition.inputSchema.safeParse(input.arguments);
    if (!parsed.success) {
      return this.error("BAD_REQUEST", parsed.error.message);
    }

    const actor: UserActor = {
      userId: input.userId,
      userRole: userResult.value.userRole,
      organizationId: null,
      organizationRole: null,
      memberId: null,
      teamId: null,
      teamRole: null,
    };

    return this.runHandle(() =>
      definition.handle(parsed.data, actor, { oauthClientId: input.oauthClientId })
    );
  }

  private async invokeOrganizationCall(
    definition: McpOrganizationCallDefinition,
    input: McpInvokeInput
  ): ServerResultAsync<unknown> {
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

    return this.runHandle(() => definition.handle(parsed.data, actor));
  }

  private async runHandle(run: () => unknown): ServerResultAsync<unknown> {
    try {
      const output = await run();
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
