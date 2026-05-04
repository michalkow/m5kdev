import type { QueryInput } from "@m5kdev/commons/modules/schemas/query.schema";
import { err, ok } from "neverthrow";
import { posthogCapture } from "../../utils/posthog";
import type { OrganizationContext, RequestContext } from "../../utils/trpc";
import type { ServerResult, ServerResultAsync } from "../base/base.dto";
import { BasePermissionService } from "../base/base.service";
import type { BillingService } from "../billing/billing.service";
import type { EmailService } from "../email/email.service";
import type * as auth from "./auth.db";
import type {
  AccountClaim,
  AccountClaimMagicLinkOutput,
  AccountClaimOutput,
  AdminOrganizationQueryInputSchema,
  ChildOrganization,
  OrganizationList,
  OrganizationType,
  ReadInvitationOutput,
  SimpleOrganization,
  UpdateChildOrganizationInput,
  Waitlist,
  WaitlistOutput,
} from "./auth.dto";
import type {
  AuthAccountClaimRepository,
  AuthInvitationRepository,
  AuthOrganizationRepository,
  AuthUserRepository,
  AuthWaitlistRepository,
} from "./auth.repository";

type OrganizationRow = typeof auth.organizations.$inferSelect;

type AuthServiceDependencies =
  | { email: EmailService }
  | { email: EmailService; billing: BillingService };

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
  private getBillingService(): BillingService | null {
    if (!("billing" in this.service)) return null;
    return this.service.billing;
  }

  private assertCanManageChildOrganizations(
    ctx: OrganizationContext,
    action: "create" | "manage" = "manage"
  ): ServerResult<{ parentId: string; organizationType: string }> {
    const organizationType = ctx.session.activeOrganizationType ?? "organization";
    const parentId = ctx.session.activeOrganizationId ?? null;
    if (!parentId) {
      return this.error(
        "FORBIDDEN",
        action === "create"
          ? "You are not allowed to create an organization without a parent organization"
          : "You are not allowed to manage child organizations without a parent organization"
      );
    }
    if (!["enterprise", "agency"].includes(organizationType)) {
      return this.error(
        "FORBIDDEN",
        action === "create"
          ? "You are not allowed to create an organization with this type"
          : "You are not allowed to manage child organizations"
      );
    }
    const role = ctx.session.activeOrganizationRole ?? "member";
    if (!["admin", "owner"].includes(role)) {
      return this.error(
        "FORBIDDEN",
        action === "create"
          ? "You are not allowed to create an organization with this role"
          : "You are not allowed to manage child organizations"
      );
    }
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

  createOrganization = this.procedure<{ name: string }>("createOrganization")
    .requireAuth("organization")
    .handle(async ({ ctx, input }): ServerResultAsync<OrganizationRow> => {
      const access = this.assertCanManageChildOrganizations(ctx, "create");
      if (access.isErr()) return err(access.error);
      return this.repository.organization.createOrganization({
        name: input.name,
        parentId: access.value.parentId,
        userId: ctx.actor.userId,
        role: access.value.organizationType === "agency" ? "agent" : "owner",
      });
    });

  listChildOrganizations = this.procedure("listChildOrganizations")
    .requireAuth("organization")
    .handle(async ({ ctx }): ServerResultAsync<ChildOrganization[]> => {
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
          columns: ["id", "name", "slug", "logo", "type", "parentId", "createdAt", "metadata"],
        }
      );
      if (result.isErr()) return err(result.error);
      return ok(result.value.rows);
    });

  listUserOrganizations = this.procedure("listUserOrganizations")
    .requireAuth()
    .handle(async ({ ctx }): ServerResultAsync<SimpleOrganization[]> => {
      return this.repository.organization.listUserOrganizations(ctx.actor.userId);
    });

  updateChildOrganization = this.procedure<UpdateChildOrganizationInput>("updateChildOrganization")
    .requireAuth("organization")
    .handle(async ({ input, ctx }): ServerResultAsync<ChildOrganization> => {
      const access = this.assertCanManageChildOrganizations(ctx);
      if (access.isErr()) return err(access.error);

      return this.repository.organization.update(input);
    });

  updateAdminOrganizationType = this.procedure<{
    organizationId: string;
    type: OrganizationType;
  }>("updateAdminOrganizationType")
    .requireAuth("admin")
    .handle(async ({ input }): ServerResultAsync<OrganizationRow> => {
      return this.repository.organization.update({
        id: input.organizationId,
        type: input.type,
      });
    });

  listAdminOrganizations = this.procedure<AdminOrganizationQueryInputSchema>(
    "listAdminOrganizations"
  )
    .requireAuth("admin")
    .handle(async ({ input }): ServerResultAsync<OrganizationList> => {
      return this.repository.organization.queryList(input, {
        globalSearchColumns: ["name", "slug"],
      });
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

  // #endregion Organizations

  // #region Waitlist
  // * =============================================================================
  // * SECTION: Waitlist
  // * =============================================================================

  listAdminWaitlist = this.procedure("listAdminWaitlist")
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
    .handle(async ({ state }): ServerResultAsync<WaitlistOutput[]> => {
      return ok(state.waitlist.rows);
    });

  getUserWaitlistCount = this.procedure("getUserWaitlistCount")
    .requireAuth()
    .handle(async ({ ctx }): ServerResultAsync<number> => {
      return this.repository.waitlist.getUserWaitlistCount(ctx.actor.userId);
    });

  listWaitlist = this.procedure<QueryInput>("listWaitlist")
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
    .handle(({ state }): ServerResult<Waitlist[]> => {
      return ok(state.waitlist.rows);
    });

  addToWaitlist = this.procedure<{ email: string }>("addToWaitlist")
    .requireAuth("admin")
    .handle(async ({ input }): ServerResultAsync<WaitlistOutput> => {
      return this.repository.waitlist.create(input);
    });

  inviteFromWaitlist = this.procedure<{ id: string }>("inviteFromWaitlist")
    .requireAuth("admin")
    .handle(async ({ input }): ServerResultAsync<Waitlist> => {
      const waitlist = await this.repository.waitlist.inviteFromWaitlist(input.id);
      if (waitlist.isErr()) return err(waitlist.error);
      if (!waitlist.value.code) return this.error("BAD_REQUEST");
      if (!waitlist.value.email) return this.error("BAD_REQUEST");
      await this.service.email.sendWaitlistInvite(waitlist.value.email, waitlist.value.code);
      return ok(waitlist.value);
    });

  inviteToWaitlist = this.procedure<{ email: string; name?: string }>("inviteToWaitlist")
    .requireAuth()
    .handle(async ({ input: { email, name }, ctx }): ServerResultAsync<Waitlist> => {
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

  createInvitationCode = this.procedure<{ name?: string }>("createInvitationCode")
    .requireAuth()
    .handle(async ({ input: { name }, ctx }): ServerResultAsync<Waitlist> => {
      posthogCapture({
        distinctId: ctx.actor.userId,
        event: "waitlist_invitation_code_created",
        properties: {
          name,
        },
      });
      return this.repository.waitlist.createInvitationCode({ userId: ctx.actor.userId, name });
    });

  joinWaitlist = this.procedure<{ email: string }>("joinWaitlist").handle(
    async ({ input }): ServerResultAsync<WaitlistOutput> => {
      const waitlist = await this.repository.waitlist.create(input);
      if (waitlist.isErr()) return err(waitlist.error);
      await this.service.email.sendWaitlistConfirmation(input.email);
      return ok(waitlist.value);
    }
  );

  removeFromWaitlist = this.procedure<{ id: string }>("removeFromWaitlist")
    .requireAuth("admin")
    .handle(async ({ input: { id } }): ServerResultAsync<WaitlistOutput> => {
      return this.repository.waitlist.update({ id, status: "REMOVED" });
    });

  validateWaitlistCode = this.procedure<string>("validateWaitlistCode").handle(
    async ({ input }): ServerResultAsync<{ status: string }> => {
      return this.repository.waitlist.validateWaitlistCode(input);
    }
  );

  createAccountClaimCode = this.procedure<{
    userId: string;
    expiresInHours?: number;
  }>("createAccountClaimCode")
    .requireAuth("admin")
    .handle(async ({ input }): ServerResultAsync<AccountClaim> => {
      return this.repository.waitlist.createAccountClaimCode(input);
    });

  listAccountClaims = this.procedure("listAccountClaims")
    .requireAuth("admin")
    .handle(async (): ServerResultAsync<AccountClaimOutput[]> => {
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
    .requireAuth()
    .handle(async ({ ctx }): ServerResultAsync<AccountClaim | null> => {
      return this.repository.waitlist.findPendingAccountClaimForUser(ctx.actor.userId);
    });

  setMyAccountClaimEmail = this.procedure<{ email: string }>("setMyAccountClaimEmail")
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

  generateAccountClaimMagicLink = this.procedure<{
    claimId: string;
    email?: string;
  }>("generateAccountClaimMagicLink")
    .requireAuth("admin")
    .handle(
      async ({ input: { claimId, email } }): ServerResultAsync<AccountClaimMagicLinkOutput> => {
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

        const response = await fetch(`${process.env.VITE_SERVER_URL}/api/auth/sign-in/magic-link`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email: targetEmail.toLowerCase(),
            callbackURL: `${process.env.VITE_APP_URL}/claim-account?claim=${claimId}`,
          }),
        });

        if (!response.ok) {
          return this.error("INTERNAL_SERVER_ERROR", "Failed to generate magic link");
        }

        const latest = await this.repository.accountClaim.latestAccountClaimMagicLink(claimId);
        if (latest.isErr()) return err(latest.error);
        if (!latest.value) return this.error("INTERNAL_SERVER_ERROR");
        return ok(latest.value);
      }
    );

  // #endregion Waitlist

  // #region Invitations
  // * =============================================================================
  // * SECTION: Invitations
  // * =============================================================================

  readInvitation = this.procedure<{ id: string }>("readInvitation")
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
    .handle(({ state }): ServerResult<ReadInvitationOutput> => {
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

  listAccountClaimMagicLinks = this.procedure<{ claimId: string }>("listAccountClaimMagicLinks")
    .requireAuth("admin")
    .handle(async ({ input }): ServerResultAsync<AccountClaimMagicLinkOutput[]> => {
      return this.repository.accountClaim.listAccountClaimMagicLinks(input.claimId);
    });

  // #endregion Account Claims
}
