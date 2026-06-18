import type { QueryInput } from "@m5kdev/commons/modules/schemas/query.schema";
import type { InferSelectModel } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { err, ok } from "neverthrow";
import { z } from "zod";
import type { BackendAppMetadata } from "../../app";
import { posthogCapture } from "../../utils/posthog";
import type { OrganizationContext, RequestContext } from "../../utils/trpc";
import type { ServerResult, ServerResultAsync } from "../base/base.dto";
import type { ResourceGrant } from "../base/base.grants";
import { BasePermissionService } from "../base/base.service";
import type { BillingService } from "../billing/billing.service";
import type { EmailService } from "../email/email.service";
import * as auth from "./auth.db";
import {
  accountClaimMagicLinkSchemas,
  invitationSchemas,
  organizationSchemas,
  waitlistSchemas,
} from "./auth.dto";
import type {
  AuthAccountClaimRepository,
  AuthInvitationRepository,
  AuthOrganizationRepository,
  AuthUserRepository,
  AuthWaitlistRepository,
} from "./auth.repository";

const schema = { ...auth };
type Schema = typeof schema;
type Orm = LibSQLDatabase<Schema>;

export type User = InferSelectModel<typeof auth.users>;
export type Organization = InferSelectModel<typeof auth.organizations>;
export type Member = InferSelectModel<typeof auth.members>;

const ACCOUNT_CLAIM_MAGIC_LINK_FETCH_MS = 10_000;

type AuthServiceDependencies =
  | { email: EmailService }
  | { email: EmailService; billing: BillingService };

export type AuthServiceHooks = {
  afterCreateOrganization?: (props: {
    orm: Orm;
    organization: Organization;
    member: Member;
    user: User;
  }) => Promise<void>;
};

export class AuthService extends BasePermissionService<
  {
    accountClaim: AuthAccountClaimRepository;
    user: AuthUserRepository;
    invitation: AuthInvitationRepository;
    waitlist: AuthWaitlistRepository;
    organization: AuthOrganizationRepository;
  },
  AuthServiceDependencies,
  RequestContext
> {
  private readonly appUrls?: BackendAppMetadata["urls"];
  private readonly hooks?: AuthServiceHooks;

  constructor(
    repository: {
      accountClaim: AuthAccountClaimRepository;
      user: AuthUserRepository;
      invitation: AuthInvitationRepository;
      waitlist: AuthWaitlistRepository;
      organization: AuthOrganizationRepository;
    },
    service: AuthServiceDependencies,
    grants: ResourceGrant[],
    appUrls?: BackendAppMetadata["urls"],
    hooks?: AuthServiceHooks
  ) {
    super(repository, service, grants);
    this.appUrls = appUrls;
    this.hooks = hooks;
  }

  private getBillingService(): BillingService | null {
    if (!("billing" in this.service)) return null;
    return this.service.billing;
  }

  private assertCanCreateChildOrganizations(
    ctx: OrganizationContext
  ): ServerResult<{ parentId: string; organizationType: string }> {
    const organizationType = ctx.session.activeOrganizationType ?? "organization";
    const parentId = ctx.session.activeOrganizationId ?? null;
    const role = ctx.session.activeOrganizationRole ?? "member";
    if (
      !parentId ||
      !["enterprise", "agency"].includes(organizationType) ||
      !["admin", "owner"].includes(role)
    )
      return this.error("FORBIDDEN", "You are not allowed to create an organization");
    return ok({ parentId, organizationType });
  }

  private assertCanManageChildOrganizations(
    ctx: OrganizationContext
  ): ServerResult<{ parentId: string; organizationType: string }> {
    const organizationType = ctx.session.activeOrganizationType ?? "organization";
    const parentId = ctx.session.activeOrganizationId ?? null;
    const role = ctx.session.activeOrganizationRole ?? "member";

    this.logger.info({ parentId, organizationType, role, ctx });
    if (!parentId)
      return this.error(
        "FORBIDDEN",
        "You are not allowed to manage child organizations without a parent organization"
      );

    if (!["enterprise", "agency"].includes(organizationType))
      return this.error(
        "FORBIDDEN",
        "You are not allowed to manage child organizations in this organization type"
      );

    if (!["admin", "owner"].includes(role))
      return this.error(
        "FORBIDDEN",
        "You are not allowed to manage child organizations in this role"
      );

    return ok({ parentId, organizationType });
  }

  // #region Users
  // * =============================================================================
  // * SECTION: Users
  // * =============================================================================

  getOnboarding = this.procedure("getOnboarding")
    .requireAuth()
    .loadResource("user", ({ ctx }) => this.repository.user.findById(ctx.actor.userId))
    .access({
      action: "read",
      entities: ({ state }) => ({
        userId: state.user.id,
      }),
    })
    .handle(({ state }): ServerResult<number> => {
      return ok(state.user.onboarding ?? 0);
    });

  setOnboarding = this.procedure<number>("setOnboarding")
    .requireAuth()
    .loadResource("user", ({ ctx }) => this.repository.user.findById(ctx.actor.userId))
    .access({
      action: "write",
      entities: ({ state }) => ({
        userId: state.user.id,
      }),
    })
    .handle(async ({ ctx, input: onboarding }): ServerResultAsync<number> => {
      posthogCapture({
        distinctId: ctx.actor.userId,
        event: "onboarding_set",
        properties: {
          onboarding,
        },
      });
      const result = await this.repository.user.update({ id: ctx.actor.userId, onboarding });
      if (result.isErr()) return err(result.error);
      return ok(result.value.onboarding as number);
    });

  getPreferences = this.procedure("getPreferences")
    .requireAuth()
    .loadResource("user", ({ ctx }) => this.repository.user.findById(ctx.actor.userId))
    .access({
      action: "read",
      entities: ({ state }) => ({
        userId: state.user.id,
      }),
    })
    .handle(({ state }): ServerResult<Record<string, unknown>> => {
      return ok(state.user.preferences ?? {});
    });

  setPreferences = this.procedure<Record<string, unknown>>("setPreferences")
    .requireAuth()
    .loadResource("user", ({ ctx }) => this.repository.user.findById(ctx.actor.userId))
    .access({
      action: "write",
      entities: ({ state }) => ({
        userId: state.user.id,
      }),
    })
    .handle(async ({ ctx, input, state }): ServerResultAsync<Record<string, unknown>> => {
      const preferences = { ...(state.user.preferences ?? {}), ...input };
      const result = await this.repository.user.update({ id: ctx.actor.userId, preferences });
      if (result.isErr()) return err(result.error);
      return ok(preferences);
    });

  getMetadata = this.procedure("getMetadata")
    .requireAuth()
    .loadResource("user", ({ ctx }) => this.repository.user.findById(ctx.actor.userId))
    .access({
      action: "read",
      entities: ({ state }) => ({
        userId: state.user.id,
      }),
    })
    .handle(({ state }): ServerResult<Record<string, unknown>> => {
      return ok(state.user.metadata ?? {});
    });

  setMetadata = this.procedure<Record<string, unknown>>("setMetadata")
    .requireAuth()
    .loadResource("user", ({ ctx }) => this.repository.user.findById(ctx.actor.userId))
    .access({
      action: "write",
      entities: ({ state }) => ({
        userId: state.user.id,
      }),
    })
    .handle(async ({ ctx, input, state }): ServerResultAsync<Record<string, unknown>> => {
      const metadata = { ...(state.user.metadata ?? {}), ...input };
      const result = await this.repository.user.update({ id: ctx.actor.userId, metadata });
      if (result.isErr()) return err(result.error);
      return ok(metadata);
    });

  getFlags = this.procedure("getFlags")
    .requireAuth()
    .loadResource("user", ({ ctx }) => this.repository.user.findById(ctx.actor.userId))
    .access({
      action: "read",
      entities: ({ state }) => ({
        userId: state.user.id,
      }),
    })
    .handle(({ state }): ServerResult<string[]> => {
      return ok(state.user.flags ?? []);
    });

  setFlags = this.procedure<string[]>("setFlags")
    .requireAuth()
    .loadResource("user", ({ ctx }) => this.repository.user.findById(ctx.actor.userId))
    .access({
      action: "write",
      entities: ({ state }) => ({
        userId: state.user.id,
      }),
    })
    .handle(async ({ ctx, input, state }): ServerResultAsync<string[]> => {
      const flags = Array.from(new Set([...(state.user.flags ?? []), ...input]));
      const result = await this.repository.user.update({ id: ctx.actor.userId, flags });
      if (result.isErr()) return err(result.error);
      return ok(flags);
    });

  // #endregion Users

  // #region Organizations
  // * =============================================================================
  // * SECTION: Organizations
  // * =============================================================================

  createOrganization = this.procedure("createOrganization")
    .input(organizationSchemas.input.create)
    .output(organizationSchemas.output.single)
    .requireAuth("organization")
    .handle(async ({ ctx, input }) => {
      const access = this.assertCanCreateChildOrganizations(ctx);
      if (access.isErr()) return err(access.error);
      const result = await this.repository.organization.createOrganization({
        name: input.name,
        parentId: access.value.parentId,
        userId: ctx.actor.userId,
        role: access.value.organizationType === "agency" ? "admin" : "owner",
      });
      if (result.isErr()) return err(result.error);
      if (this.hooks?.afterCreateOrganization) {
        try {
          await this.hooks.afterCreateOrganization({
            orm: this.repository.organization.getOrm(),
            organization: result.value.organization,
            member: result.value.member,
            user: ctx.user,
          });
        } catch (error) {
          return this.error(
            "INTERNAL_SERVER_ERROR",
            "Failed to call afterCreateOrganization hook",
            {
              cause: error,
            }
          );
        }
      }
      return ok(result.value.organization);
    });

  listChildOrganizations = this.procedure("listChildOrganizations")
    .output(organizationSchemas.output.child.array())
    .requireAuth("organization")
    .handle(async ({ ctx }) => {
      const access = this.assertCanManageChildOrganizations(ctx);
      if (access.isErr()) return err(access.error);
      const result = await this.repository.organization.queryList(
        {
          filters: [
            {
              columnId: "parentId",
              type: "string",
              method: "equals",
              value: access.value.parentId,
            },
          ],
        },
        {
          columns: [
            "id",
            "name",
            "slug",
            "logo",
            "type",
            "parentId",
            "createdAt",
            "metadata",
            "onboarding",
          ],
        }
      );
      if (result.isErr()) return err(result.error);
      return ok(result.value.rows);
    });

  listUserOrganizations = this.procedure("listUserOrganizations")
    .output(organizationSchemas.output.simple.array())
    .requireAuth()
    .handle(async ({ ctx }) => {
      return this.repository.organization.listUserOrganizations(ctx.actor.userId);
    });

  updateChildOrganization = this.procedure("updateChildOrganization")
    .input(organizationSchemas.input.updateChild)
    .output(organizationSchemas.output.child)
    .requireAuth("organization")
    .handle(async ({ input, ctx }) => {
      const access = this.assertCanManageChildOrganizations(ctx);
      if (access.isErr()) return err(access.error);

      const target = await this.repository.organization.findById(input.id, undefined, ["parentId"]);
      if (target.isErr()) return err(target.error);
      if (!target.value) return this.error("NOT_FOUND", "Organization not found");
      if (target.value.parentId !== access.value.parentId) {
        return this.error("FORBIDDEN", "You are not allowed to update this organization");
      }

      const { id, name, metadata } = input;
      if (metadata !== undefined) {
        const current = await this.repository.organization.findById(id, undefined, ["metadata"]);
        if (current.isErr()) return err(current.error);
        return this.repository.organization.update({
          id,
          name,
          metadata: { ...(current.value?.metadata ?? {}), ...metadata },
        });
      }
      return this.repository.organization.update({ id, name });
    });

  createAdminOrganization = this.procedure("createAdminOrganization")
    .input(organizationSchemas.input.createAdmin)
    .output(organizationSchemas.output.admin)
    .requireAuth("admin")
    .handle(async ({ input }) => {
      return this.repository.organization.create({ ...input, parentId: null });
    });

  updateAdminOrganization = this.procedure("updateAdminOrganization")
    .input(organizationSchemas.input.updateAdmin)
    .output(organizationSchemas.output.admin)
    .requireAuth("admin")
    .handle(async ({ input }) => {
      return this.repository.organization.update(input);
    });

  listAdminOrganizations = this.procedure("listAdminOrganizations")
    .input(organizationSchemas.input.list)
    .output(organizationSchemas.output.list)
    .requireAuth("admin")
    .handle(async ({ input }) => {
      return this.repository.organization.queryList(input, {
        globalSearchColumns: ["name", "slug"],
      });
    });

  searchAdminUsers = this.procedure("searchAdminUsers")
    .input(organizationSchemas.input.list)
    .output(organizationSchemas.output.adminUsers)
    .requireAuth("admin")
    .handle(async ({ input }) => {
      return this.repository.user.queryList(input, {
        columns: ["id", "name", "email", "role", "banned", "emailVerified"],
        globalSearchColumns: ["name", "email"],
      });
    });

  listAdminOrganizationMembers = this.procedure("listAdminOrganizationMembers")
    .input(organizationSchemas.input.adminMembers)
    .output(organizationSchemas.output.members)
    .requireAuth("admin")
    .handle(async ({ input }) => {
      const organization = await this.repository.organization.findById(
        input.organizationId,
        undefined,
        ["id", "name", "slug", "logo", "type", "parentId", "createdAt", "onboarding"]
      );
      if (organization.isErr()) return err(organization.error);
      if (!organization.value) return this.error("NOT_FOUND", "Organization not found");

      const members = await this.repository.organization.listOrganizationMembers(
        input.organizationId
      );
      if (members.isErr()) return err(members.error);

      return ok({ organization: organization.value, members: members.value });
    });

  addAdminOrganizationMember = this.procedure("addAdminOrganizationMember")
    .input(organizationSchemas.input.addAdminMember)
    .output(organizationSchemas.output.member)
    .requireAuth("admin")
    .handle(async ({ input }) => {
      return this.repository.organization.addOrganizationMember(input);
    });

  updateAdminOrganizationMemberRole = this.procedure("updateAdminOrganizationMemberRole")
    .input(organizationSchemas.input.updateAdminMemberRole)
    .output(organizationSchemas.output.member)
    .requireAuth("admin")
    .handle(async ({ input }) => {
      return this.repository.organization.updateOrganizationMemberRole(input);
    });

  removeAdminOrganizationMember = this.procedure("removeAdminOrganizationMember")
    .input(organizationSchemas.input.removeAdminMember)
    .output(z.object({ id: z.string() }))
    .requireAuth("admin")
    .handle(async ({ input }) => {
      return this.repository.organization.removeOrganizationMember(input);
    });

  getOrganizationPreferences = this.procedure("getOrganizationPreferences")
    .requireAuth("organization")
    .loadResource("organization", ({ ctx }) =>
      this.repository.organization.findById(ctx.actor.organizationId)
    )
    .access({
      action: "read",
      entities: ({ state }) => ({
        organizationId: state.organization.id,
      }),
    })
    .handle(({ state }): ServerResult<Record<string, unknown>> => {
      return ok(state.organization.preferences ?? {});
    });

  setOrganizationPreferences = this.procedure<Record<string, unknown>>("setOrganizationPreferences")
    .requireAuth("organization")
    .loadResource("organization", ({ ctx }) =>
      this.repository.organization.findById(ctx.actor.organizationId)
    )
    .access({
      action: "write",
      entities: ({ state }) => ({
        organizationId: state.organization.id,
      }),
    })
    .handle(async ({ ctx, input, state }): ServerResultAsync<Record<string, unknown>> => {
      const preferences = { ...(state.organization.preferences ?? {}), ...input };
      const result = await this.repository.organization.update({
        id: ctx.actor.organizationId,
        preferences,
      });
      if (result.isErr()) return err(result.error);
      return ok(preferences);
    });

  getOrganizationFlags = this.procedure("getOrganizationFlags")
    .requireAuth("organization")
    .loadResource("organization", ({ ctx }) =>
      this.repository.organization.findById(ctx.actor.organizationId)
    )
    .access({
      action: "read",
      entities: ({ state }) => ({
        organizationId: state.organization.id,
      }),
    })
    .handle(({ state }): ServerResult<string[]> => {
      return ok(state.organization.flags ?? []);
    });

  setOrganizationFlags = this.procedure<string[]>("setOrganizationFlags")
    .requireAuth("organization")
    .loadResource("organization", ({ ctx }) =>
      this.repository.organization.findById(ctx.actor.organizationId)
    )
    .access({
      action: "write",
      entities: ({ state }) => ({
        organizationId: state.organization.id,
      }),
    })
    .handle(async ({ ctx, input, state }): ServerResultAsync<string[]> => {
      const flags = Array.from(new Set([...(state.organization.flags ?? []), ...input]));
      const result = await this.repository.organization.update({
        id: ctx.actor.organizationId,
        flags,
      });
      if (result.isErr()) return err(result.error);
      return ok(flags);
    });

  getOrganizationOnboarding = this.procedure("getOrganizationOnboarding")
    .requireAuth("organization")
    .loadResource("organization", ({ ctx }) =>
      this.repository.organization.findById(ctx.actor.organizationId)
    )
    .access({
      action: "read",
      entities: ({ state }) => ({
        organizationId: state.organization.id,
      }),
    })
    .handle(({ state }): ServerResult<number> => {
      return ok(state.organization.onboarding ?? 0);
    });

  setOrganizationOnboarding = this.procedure<number>("setOrganizationOnboarding")
    .requireAuth("organization")
    .loadResource("organization", ({ ctx }) =>
      this.repository.organization.findById(ctx.actor.organizationId)
    )
    .access({
      action: "write",
      entities: ({ state }) => ({
        organizationId: state.organization.id,
      }),
    })
    .handle(async ({ ctx, input: onboarding }): ServerResultAsync<number> => {
      const result = await this.repository.organization.update({
        id: ctx.actor.organizationId,
        onboarding,
      });
      if (result.isErr()) return err(result.error);
      return ok(result.value.onboarding ?? onboarding);
    });

  getOrganizationMetadata = this.procedure("getOrganizationMetadata")
    .requireAuth("organization")
    .loadResource("organization", ({ ctx }) =>
      this.repository.organization.findById(ctx.actor.organizationId)
    )
    .access({
      action: "read",
      entities: ({ state }) => ({
        organizationId: state.organization.id,
      }),
    })
    .handle(({ state }): ServerResult<Record<string, unknown>> => {
      return ok(state.organization.metadata ?? {});
    });

  setOrganizationMetadata = this.procedure<Record<string, unknown>>("setOrganizationMetadata")
    .requireAuth("organization")
    .loadResource("organization", ({ ctx }) =>
      this.repository.organization.findById(ctx.actor.organizationId)
    )
    .access({
      action: "write",
      entities: ({ state }) => ({
        organizationId: state.organization.id,
      }),
    })
    .handle(async ({ ctx, input, state }): ServerResultAsync<Record<string, unknown>> => {
      const metadata = { ...(state.organization.metadata ?? {}), ...input };
      const result = await this.repository.organization.update({
        id: ctx.actor.organizationId,
        metadata,
      });
      if (result.isErr()) return err(result.error);
      return ok(metadata);
    });

  getMemberOnboarding = this.procedure("getMemberOnboarding")
    .requireAuth("organization")
    .loadResource("member", ({ ctx }) =>
      this.repository.organization.findMemberByUserAndOrganization({
        userId: ctx.actor.userId,
        organizationId: ctx.actor.organizationId,
      })
    )
    .access({
      action: "read",
      entities: ({ state }) => ({
        userId: state.member.userId,
      }),
    })
    .handle(({ state }): ServerResult<number> => {
      return ok(state.member.onboarding ?? 0);
    });

  setMemberOnboarding = this.procedure<number>("setMemberOnboarding")
    .requireAuth("organization")
    .loadResource("member", ({ ctx }) =>
      this.repository.organization.findMemberByUserAndOrganization({
        userId: ctx.actor.userId,
        organizationId: ctx.actor.organizationId,
      })
    )
    .access({
      action: "write",
      entities: ({ state }) => ({
        userId: state.member.userId,
      }),
    })
    .handle(async ({ input: onboarding, state }): ServerResultAsync<number> => {
      const result = await this.repository.organization.updateMember({
        id: state.member.id,
        onboarding,
      });
      if (result.isErr()) return err(result.error);
      return ok(result.value.onboarding ?? onboarding);
    });

  getMemberPreferences = this.procedure("getMemberPreferences")
    .requireAuth("organization")
    .loadResource("member", ({ ctx }) =>
      this.repository.organization.findMemberByUserAndOrganization({
        userId: ctx.actor.userId,
        organizationId: ctx.actor.organizationId,
      })
    )
    .access({
      action: "read",
      entities: ({ state }) => ({
        userId: state.member.userId,
      }),
    })
    .handle(({ state }): ServerResult<Record<string, unknown>> => {
      return ok(state.member.preferences ?? {});
    });

  setMemberPreferences = this.procedure<Record<string, unknown>>("setMemberPreferences")
    .requireAuth("organization")
    .loadResource("member", ({ ctx }) =>
      this.repository.organization.findMemberByUserAndOrganization({
        userId: ctx.actor.userId,
        organizationId: ctx.actor.organizationId,
      })
    )
    .access({
      action: "write",
      entities: ({ state }) => ({
        userId: state.member.userId,
      }),
    })
    .handle(async ({ input, state }): ServerResultAsync<Record<string, unknown>> => {
      const preferences = { ...(state.member.preferences ?? {}), ...input };
      const result = await this.repository.organization.updateMember({
        id: state.member.id,
        preferences,
      });
      if (result.isErr()) return err(result.error);
      return ok(preferences);
    });

  getMemberMetadata = this.procedure("getMemberMetadata")
    .requireAuth("organization")
    .loadResource("member", ({ ctx }) =>
      this.repository.organization.findMemberByUserAndOrganization({
        userId: ctx.actor.userId,
        organizationId: ctx.actor.organizationId,
      })
    )
    .access({
      action: "read",
      entities: ({ state }) => ({
        userId: state.member.userId,
      }),
    })
    .handle(({ state }): ServerResult<Record<string, unknown>> => {
      return ok(state.member.metadata ?? {});
    });

  setMemberMetadata = this.procedure<Record<string, unknown>>("setMemberMetadata")
    .requireAuth("organization")
    .loadResource("member", ({ ctx }) =>
      this.repository.organization.findMemberByUserAndOrganization({
        userId: ctx.actor.userId,
        organizationId: ctx.actor.organizationId,
      })
    )
    .access({
      action: "write",
      entities: ({ state }) => ({
        userId: state.member.userId,
      }),
    })
    .handle(async ({ input, state }): ServerResultAsync<Record<string, unknown>> => {
      const metadata = { ...(state.member.metadata ?? {}), ...input };
      const result = await this.repository.organization.updateMember({
        id: state.member.id,
        metadata,
      });
      if (result.isErr()) return err(result.error);
      return ok(metadata);
    });

  getMemberFlags = this.procedure("getMemberFlags")
    .requireAuth("organization")
    .loadResource("member", ({ ctx }) =>
      this.repository.organization.findMemberByUserAndOrganization({
        userId: ctx.actor.userId,
        organizationId: ctx.actor.organizationId,
      })
    )
    .access({
      action: "read",
      entities: ({ state }) => ({
        userId: state.member.userId,
      }),
    })
    .handle(({ state }): ServerResult<string[]> => {
      return ok(state.member.flags ?? []);
    });

  setMemberFlags = this.procedure<string[]>("setMemberFlags")
    .requireAuth("organization")
    .loadResource("member", ({ ctx }) =>
      this.repository.organization.findMemberByUserAndOrganization({
        userId: ctx.actor.userId,
        organizationId: ctx.actor.organizationId,
      })
    )
    .access({
      action: "write",
      entities: ({ state }) => ({
        userId: state.member.userId,
      }),
    })
    .handle(async ({ input, state }): ServerResultAsync<string[]> => {
      const flags = Array.from(new Set([...(state.member.flags ?? []), ...input]));
      const result = await this.repository.organization.updateMember({
        id: state.member.id,
        flags,
      });
      if (result.isErr()) return err(result.error);
      return ok(flags);
    });

  // #endregion Organizations

  // #region Waitlist
  // * =============================================================================
  // * SECTION: Waitlist
  // * =============================================================================

  listAdminWaitlist = this.procedure("listAdminWaitlist")
    .output(waitlistSchemas.output.simple.array())
    .requireAuth("admin")
    .loadResource("waitlist", () =>
      this.repository.waitlist.queryList(
        {
          filters: [
            {
              columnId: "type",
              type: "string",
              method: "equals",
              value: "WAITLIST",
            },
          ],
        },
        {
          columns: ["id", "email", "name", "createdAt", "updatedAt", "status"],
        }
      )
    )
    .handle(async ({ state }) => {
      return ok(state.waitlist.rows);
    });

  getUserWaitlistCount = this.procedure("getUserWaitlistCount")
    .requireAuth()
    .handle(async ({ ctx }): ServerResultAsync<number> => {
      return this.repository.waitlist.getUserWaitlistCount(ctx.actor.userId);
    });

  listWaitlist = this.procedure<QueryInput>("listWaitlist")
    .output(waitlistSchemas.output.full.array())
    .requireAuth()
    .addContextFilter(["user"])
    .use("waitlist", ({ input }) =>
      this.repository.waitlist.queryList({
        ...input,
        filters: [
          ...(input.filters ?? []),
          { columnId: "type", type: "string", method: "equals", value: "WAITLIST" },
        ],
      })
    )
    .handle(({ state }) => {
      return ok(state.waitlist.rows);
    });

  addToWaitlist = this.procedure("addToWaitlist")
    .input(waitlistSchemas.input.add)
    .output(waitlistSchemas.output.single)
    .requireAuth("admin")
    .handle(async ({ input }) => {
      return this.repository.waitlist.create(input);
    });

  inviteFromWaitlist = this.procedure("inviteFromWaitlist")
    .input(waitlistSchemas.input.inviteFrom)
    .output(waitlistSchemas.output.claim)
    .requireAuth("admin")
    .handle(async ({ input }) => {
      const waitlist = await this.repository.waitlist.inviteFromWaitlist(input);
      if (waitlist.isErr()) return err(waitlist.error);
      if (!waitlist.value.code) return this.error("BAD_REQUEST");
      if (!waitlist.value.email) return this.error("BAD_REQUEST");
      await this.service.email.sendWaitlistInvite(waitlist.value.email, waitlist.value.code);
      return ok(waitlist.value);
    });

  inviteToWaitlist = this.procedure("inviteToWaitlist")
    .input(waitlistSchemas.input.invite)
    .output(waitlistSchemas.output.full)
    .requireAuth()
    .handle(async ({ input: { email, name }, ctx }) => {
      const count = await this.repository.waitlist.getUserWaitlistCount(ctx.user.id);
      if (count.isErr()) return err(count.error);
      if (count.value >= 3) return this.error("BAD_REQUEST", "Run out of invites");
      const waitlist = await this.repository.waitlist.inviteToWaitlist({
        email,
        userId: ctx.user.id,
        name,
      });
      if (waitlist.isErr()) return err(waitlist.error);
      if (!waitlist.value.code) return this.error("BAD_REQUEST");
      await this.service.email.sendWaitlistUserInvite(
        email,
        waitlist.value.code,
        ctx.user.name,
        name
      );
      posthogCapture({
        distinctId: ctx.user.id,
        event: "waitlist_invite_sent",
        properties: {
          email,
          name,
        },
      });
      return ok(waitlist.value);
    });

  createInvitationCode = this.procedure("createInvitationCode")
    .input(waitlistSchemas.input.create)
    .output(waitlistSchemas.output.full)
    .requireAuth()
    .handle(async ({ input: { name }, ctx }) => {
      posthogCapture({
        distinctId: ctx.actor.userId,
        event: "waitlist_invitation_code_created",
        properties: {
          name,
        },
      });
      return this.repository.waitlist.createInvitationCode({ userId: ctx.actor.userId, name });
    });

  joinWaitlist = this.procedure("joinWaitlist")
    .input(waitlistSchemas.input.join)
    .output(waitlistSchemas.output.single)
    .handle(async ({ input }) => {
      const waitlist = await this.repository.waitlist.create(input);
      if (waitlist.isErr()) return err(waitlist.error);
      await this.service.email.sendWaitlistConfirmation(input.email);
      await this.service.email.sendSystemWaitlistNotification(input.email);
      return ok(waitlist.value);
    });

  removeFromWaitlist = this.procedure("removeFromWaitlist")
    .input(waitlistSchemas.input.remove)
    .output(waitlistSchemas.output.single)
    .requireAuth("admin")
    .handle(async ({ input: { id } }) => {
      return this.repository.waitlist.update({ id, status: "REMOVED" });
    });

  validateWaitlistCode = this.procedure<string>("validateWaitlistCode").handle(
    async ({ input }): ServerResultAsync<{ status: string }> => {
      return this.repository.waitlist.validateWaitlistCode(input);
    }
  );

  createAccountClaimCode = this.procedure("createAccountClaimCode")
    .input(accountClaimMagicLinkSchemas.input.create)
    .output(waitlistSchemas.output.claim)
    .requireAuth("admin")
    .handle(async ({ input }) => {
      return this.repository.waitlist.createAccountClaimCode(input);
    });

  listAccountClaims = this.procedure("listAccountClaims")
    .output(waitlistSchemas.output.accountClaim.array())
    .requireAuth("admin")
    .handle(async () => {
      const result = await this.repository.waitlist.queryList(
        {
          filters: [{ columnId: "type", type: "string", method: "equals", value: "ACCOUNT_CLAIM" }],
          sort: "createdAt",
          order: "desc",
        },
        {
          columns: [
            "id",
            "claimUserId",
            "status",
            "expiresAt",
            "claimedAt",
            "claimedEmail",
            "createdAt",
            "updatedAt",
          ],
        }
      );
      if (result.isErr()) return err(result.error);
      return ok(result.value.rows);
    });

  getMyAccountClaimStatus = this.procedure("getMyAccountClaimStatus")
    .output(waitlistSchemas.output.claim.nullable())
    .requireAuth()
    .handle(async ({ ctx }) => {
      return this.repository.waitlist.findPendingAccountClaimForUser(ctx.actor.userId);
    });

  setMyAccountClaimEmail = this.procedure("setMyAccountClaimEmail")
    .input(accountClaimMagicLinkSchemas.input.setEmail)
    .requireAuth()
    .handle(async ({ ctx, input: { email } }): ServerResultAsync<{ status: boolean }> => {
      return this.repository.waitlist.setAccountClaimEmail({ userId: ctx.actor.userId, email });
    });

  acceptMyAccountClaim = this.procedure("acceptMyAccountClaim")
    .requireAuth()
    .handle(async ({ ctx }): ServerResultAsync<{ status: boolean }> => {
      const pendingClaim = await this.repository.waitlist.findPendingAccountClaimForUser(
        ctx.user.id
      );
      if (pendingClaim.isErr()) return err(pendingClaim.error);

      const accepted = await this.repository.waitlist.acceptAccountClaim(ctx.user.id);
      if (accepted.isErr()) return err(accepted.error);

      if (pendingClaim.value) {
        const billingService = this.getBillingService();
        if (billingService) {
          await billingService.createUserHook({ user: ctx.user });
        }
      }

      return ok(accepted.value);
    });

  generateAccountClaimMagicLink = this.procedure("generateAccountClaimMagicLink")
    .input(accountClaimMagicLinkSchemas.input.generateLink)
    .output(accountClaimMagicLinkSchemas.output.single)
    .requireAuth("admin")
    .handle(async ({ input: { claimId, email } }) => {
      const claim = await this.repository.waitlist.findAccountClaimById(claimId);
      if (claim.isErr()) return err(claim.error);
      if (!claim.value) return this.error("NOT_FOUND", "Claim not found");
      if (!claim.value.claimUserId) return this.error("BAD_REQUEST", "Claim has no user");
      if (claim.value.status !== "INVITED") {
        return this.error("BAD_REQUEST", "Claim is not pending");
      }
      if (claim.value.expiresAt && claim.value.expiresAt < new Date()) {
        return this.error("BAD_REQUEST", "Claim is expired");
      }

      const targetEmail = email ?? claim.value.claimedEmail ?? undefined;
      if (!targetEmail) {
        return this.error("BAD_REQUEST", "Email required to generate magic link");
      }

      const setEmail = await this.repository.waitlist.setAccountClaimEmail({
        userId: claim.value.claimUserId,
        email: targetEmail,
      });
      if (setEmail.isErr()) return err(setEmail.error);

      const apiBase = (this.appUrls?.api ?? process.env.VITE_SERVER_URL)?.trim();
      const webBase = (this.appUrls?.web ?? process.env.VITE_APP_URL)?.trim();
      if (!apiBase || !webBase) {
        return this.error(
          "INTERNAL_SERVER_ERROR",
          "Missing public API or web URL (configure app.urls.api / app.urls.web or VITE_SERVER_URL / VITE_APP_URL)"
        );
      }

      const magicLinkUrl = new URL("/api/auth/sign-in/magic-link", apiBase).toString();
      const callback = new URL("/claim-account", webBase);
      callback.searchParams.set("claim", claimId);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), ACCOUNT_CLAIM_MAGIC_LINK_FETCH_MS);

      let response: Response;
      try {
        response = await fetch(magicLinkUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email: targetEmail.toLowerCase(),
            callbackURL: callback.toString(),
          }),
          signal: controller.signal,
        });
      } catch (cause: unknown) {
        if (cause instanceof Error && cause.name === "AbortError") {
          return this.error("INTERNAL_SERVER_ERROR", "Magic link request timed out", { cause });
        }
        return this.error("INTERNAL_SERVER_ERROR", "Failed to generate magic link", { cause });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        return this.error("INTERNAL_SERVER_ERROR", "Failed to generate magic link");
      }

      const latest = await this.repository.accountClaim.latestAccountClaimMagicLink({ claimId });
      if (latest.isErr()) return err(latest.error);
      if (!latest.value) return this.error("INTERNAL_SERVER_ERROR");
      return ok(latest.value);
    });

  // #endregion Waitlist

  // #region Invitations
  // * =============================================================================
  // * SECTION: Invitations
  // * =============================================================================

  readInvitation = this.procedure("readInvitation")
    .input(invitationSchemas.input.read)
    .output(invitationSchemas.output.read)
    .loadResource("invitation", ({ input }) =>
      this.repository.invitation.findById(input.id, undefined, ["organizationId", "email"])
    )
    .loadResource("organization", ({ state }) =>
      this.repository.organization.findById(state.invitation.organizationId, undefined, [
        "name",
        "slug",
        "logo",
      ])
    )
    .handle(({ state }) => {
      return ok({
        organizationId: state.invitation.organizationId,
        email: state.invitation.email,
        name: state.organization.name,
        slug: state.organization.slug,
        logo: state.organization.logo,
      });
    });

  // #endregion Invitations

  // #region Account Claims
  // * =============================================================================
  // * SECTION: Account Claims
  // * =============================================================================

  listAccountClaimMagicLinks = this.procedure("listAccountClaimMagicLinks")
    .input(accountClaimMagicLinkSchemas.input.listLinks)
    .output(accountClaimMagicLinkSchemas.output.single.array())
    .requireAuth("admin")
    .handle(async ({ input }) => {
      return this.repository.accountClaim.listAccountClaimMagicLinks(input);
    });

  // #endregion Account Claims
}
