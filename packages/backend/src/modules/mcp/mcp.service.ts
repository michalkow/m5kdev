import { err, ok } from "neverthrow";
import { Base } from "../../base/base.abstract";
import type { ServerResultAsync } from "../../base/base.dto";
import type { User } from "../auth/auth.lib";
import type { AuthOrganizationRepository, AuthUserRepository } from "../auth/auth.repository";
import type { McpRepository } from "./mcp.repository";
import type { McpConsentOrganization, McpListedOrganization } from "./mcp.types";

export class McpService extends Base {
  constructor(
    private readonly mcpRepository: McpRepository,
    private readonly organizationRepository: AuthOrganizationRepository,
    private readonly userRepository: AuthUserRepository
  ) {
    super("service");
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
    const userResult = await this.resolveCallerUser({ userId });
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
    const userResult = await this.resolveCallerUser({ userId });
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

  /**
   * Loads the OAuth User for an in-process MCP call. The caller context carries
   * this User with no session; organizationProcedure names the Organization
   * from the tool `organizationId`.
   */
  async resolveCallerUser({ userId }: { userId: string }): ServerResultAsync<User> {
    const userResult = await this.userRepository.findById(userId);
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
    const allowlisted = await this.mcpRepository.listOrganizationIds({
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
