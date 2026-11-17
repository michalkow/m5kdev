import { err, ok } from "neverthrow";
import type { OrganizationActor } from "../../base/base.actor";
import { resolveOrganizationActor } from "../../base/base.actor";
import type { ServerResultAsync } from "../../base/base.dto";
import { BaseService } from "../../base/base.service";
import type { RequireEntitlements } from "../../utils/trpc";
import type { User } from "../auth/auth.lib";
import type { AuthOrganizationRepository, AuthUserRepository } from "../auth/auth.repository";
import type { McpRepository } from "./mcp.repository";
import type { McpConsentOrganization, McpListedOrganization } from "./mcp.types";

interface ListAvailableToolNamesInput {
  tools: readonly { name: string; requiredCapabilities?: readonly string[] }[];
  userId: string;
  oauthClientId: string;
  requireEntitlements?: RequireEntitlements;
}

export class McpService extends BaseService<
  { mcp: McpRepository; organization: AuthOrganizationRepository; user: AuthUserRepository },
  Record<string, never>
> {
  constructor(
    mcpRepository: McpRepository,
    organizationRepository: AuthOrganizationRepository,
    userRepository: AuthUserRepository
  ) {
    super({ mcp: mcpRepository, organization: organizationRepository, user: userRepository }, {});
  }

  /** Discovery is the union of eligible Organizations, with all keys required in one. */
  readonly listAvailableToolNames = this.procedure<ListAvailableToolNamesInput>(
    "listAvailableToolNames"
  ).handle(async ({ input }): ServerResultAsync<string[]> => {
    const { tools, userId, oauthClientId, requireEntitlements } = input;
    if (!requireEntitlements || !tools.some((tool) => tool.requiredCapabilities?.length)) {
      return ok(tools.map((tool) => tool.name));
    }
    const user = await this.resolveCallerUser({ userId });
    if (user.isErr()) return err(user.error);
    const ids = await this.repository.mcp.listOrganizationIds({ userId, oauthClientId });
    if (ids.isErr()) return err(ids.error);
    const actors: OrganizationActor[] = [];
    for (const organizationId of ids.value) {
      const actor = await resolveOrganizationActor({
        user: { userId, userRole: user.value.role ?? "user" },
        organizationId,
        memberships: this.repository.organization,
      });
      if (actor.isErr()) {
        if (actor.error.code === "NOT_FOUND") continue;
        return err(actor.error);
      }
      actors.push(actor.value);
    }
    const available: string[] = [];
    for (const tool of tools) {
      if (!tool.requiredCapabilities?.length) {
        available.push(tool.name);
        continue;
      }
      for (const actor of actors) {
        const allowed = await requireEntitlements(actor, tool.requiredCapabilities);
        if (allowed.isOk()) {
          available.push(tool.name);
          break;
        }
        if (allowed.error.code !== "FORBIDDEN" || allowed.error.context?.kind !== "entitlement") {
          return err(allowed.error);
        }
      }
    }
    return ok(available);
  });

  replaceAllowlist(input: {
    oauthClientId: string;
    userId: string;
    organizationIds: readonly string[];
  }): ServerResultAsync<void> {
    return this.repository.mcp.replaceAllowlist(input);
  }

  async listConsentOrganizations({
    userId,
    oauthClientId,
  }: {
    userId: string;
    oauthClientId: string;
  }): ServerResultAsync<McpConsentOrganization[]> {
    const userResult = await this.resolveCallerUser({ userId });
    if (userResult.isErr()) return err(userResult.error);
    const liveResult = await this.repository.organization.listUserOrganizations(userId);
    if (liveResult.isErr()) return err(liveResult.error);
    const allowlistedResult = await this.repository.mcp.listOrganizationIds({
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
    const liveResult = await this.repository.organization.listUserOrganizations(input.userId);
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
    const userResult = await this.resolveCallerUser({ userId });
    if (userResult.isErr()) return err(userResult.error);
    const idsResult = await this.repository.mcp.listOrganizationIds({ oauthClientId, userId });
    if (idsResult.isErr()) return err(idsResult.error);
    const listed: McpListedOrganization[] = [];
    for (const organizationId of idsResult.value) {
      const memberResult = await this.repository.organization.findMemberByUserAndOrganization({
        userId,
        organizationId,
      });
      if (memberResult.isErr()) continue;
      if (!memberResult.value.userId) continue;
      const orgResult = await this.repository.organization.findById(organizationId);
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

  /**
   * Loads the OAuth User for an in-process MCP call. The caller context carries
   * this User with no session; organizationProcedure names the Organization
   * from the tool `organizationId`.
   */
  async resolveCallerUser({ userId }: { userId: string }): ServerResultAsync<User> {
    const userResult = await this.repository.user.findById(userId);
    if (userResult.isErr()) return err(userResult.error);
    if (!userResult.value) return this.error("NOT_FOUND", "User not found");
    return ok(userResult.value as User);
  }

  /**
   * Consent boundary for org-scoped MCP tools. Membership is not checked here;
   * the invoked procedure builds OrganizationActor from a live Membership.
   */
  async checkOrganizationAllowlisted({
    oauthClientId,
    userId,
    organizationId,
  }: {
    oauthClientId: string;
    userId: string;
    organizationId: string;
  }): ServerResultAsync<void> {
    const allowlisted = await this.repository.mcp.listOrganizationIds({
      oauthClientId,
      userId,
    });
    if (allowlisted.isErr()) return err(allowlisted.error);
    if (!allowlisted.value.includes(organizationId)) {
      return this.error("FORBIDDEN", "Organization is not on the MCP allowlist", {
        context: { reason: "allowlist" },
      });
    }
    return ok(undefined);
  }
}
