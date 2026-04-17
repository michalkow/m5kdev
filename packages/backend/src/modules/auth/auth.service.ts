import { err, ok } from "neverthrow";
import { ServerError } from "../../utils/errors";
import { posthogCapture } from "../../utils/posthog";
import type { Context } from "../../utils/trpc";
import { createActorFromContext, type OrganizationActor } from "../base/base.actor";
import type { ServerResult, ServerResultAsync } from "../base/base.dto";
import { BaseService } from "../base/base.service";
import type { BillingService } from "../billing/billing.service";
import type { EmailService } from "../email/email.service";
import type {
  AccountClaim,
  AccountClaimMagicLinkOutput,
  AccountClaimOutput,
  ReadInvitationOutput,
  Waitlist,
  WaitlistOutput,
} from "./auth.dto";
import type { AuthRepository } from "./auth.repository";

type AuthServiceDependencies =
  | { email: EmailService }
  | { email: EmailService; billing: BillingService };

export class AuthService extends BaseService<{ auth: AuthRepository }, AuthServiceDependencies> {
  private getBillingService(): BillingService | null {
    if (!("billing" in this.service)) return null;
    return this.service.billing;
  }

  async readInvitation({ id }: { id: string }): ServerResultAsync<ReadInvitationOutput> {
    return this.repository.auth.readInvitation(id);
  }

  private organizationActorFromCtx(ctx: Context): ServerResult<OrganizationActor> {
    try {
      return ok(createActorFromContext({ user: ctx.user, session: ctx.session }, "organization"));
    } catch (e) {
      if (e instanceof ServerError) return err(e);
      throw e;
    }
  }

  async getUserWaitlistCount(ctx: Context): ServerResultAsync<number> {
    if (ctx.actor.userRole === "admin") return ok(0);
    return this.repository.auth.getUserWaitlistCount(ctx.actor.userId);
  }

  async getOnboarding(ctx: Context): ServerResultAsync<number> {
    return this.repository.auth.getOnboarding(ctx.actor.userId);
  }

  async setOnboarding(onboarding: number, ctx: Context): ServerResultAsync<number> {
    posthogCapture({
      distinctId: ctx.actor.userId,
      event: "onboarding_set",
      properties: {
        onboarding,
      },
    });
    return this.repository.auth.setOnboarding(ctx.actor.userId, onboarding);
  }

  async getPreferences(ctx: Context): ServerResultAsync<Record<string, unknown>> {
    return this.repository.auth.getPreferences(ctx.actor.userId);
  }

  async setPreferences(
    preferences: Record<string, unknown>,
    ctx: Context
  ): ServerResultAsync<Record<string, unknown>> {
    posthogCapture({
      distinctId: ctx.actor.userId,
      event: "preferences_set",
    });
    return this.repository.auth.setPreferences(ctx.actor.userId, preferences);
  }

  async getOrganizationPreferences(ctx: Context): ServerResultAsync<Record<string, unknown>> {
    const org = this.organizationActorFromCtx(ctx);
    if (org.isErr()) return err(org.error);
    const actor = org.value;

    return this.repository.auth.getOrganizationPreferences(actor.userId, actor.organizationId);
  }

  async setOrganizationPreferences(
    preferences: Record<string, unknown>,
    ctx: Context
  ): ServerResultAsync<Record<string, unknown>> {
    const org = this.organizationActorFromCtx(ctx);
    if (org.isErr()) return err(org.error);
    const actor = org.value;

    posthogCapture({
      distinctId: actor.userId,
      event: "organization_preferences_set",
      properties: {
        organizationId: actor.organizationId,
      },
    });

    return this.repository.auth.setOrganizationPreferences(
      actor.userId,
      actor.organizationId,
      preferences
    );
  }

  async getMetadata(ctx: Context): ServerResultAsync<Record<string, unknown>> {
    return this.repository.auth.getMetadata(ctx.actor.userId);
  }

  async setMetadata(
    metadata: Record<string, unknown>,
    ctx: Context
  ): ServerResultAsync<Record<string, unknown>> {
    posthogCapture({
      distinctId: ctx.actor.userId,
      event: "metadata_set",
    });
    return this.repository.auth.setMetadata(ctx.actor.userId, metadata);
  }

  async getFlags(ctx: Context): ServerResultAsync<string[]> {
    return this.repository.auth.getFlags(ctx.actor.userId);
  }

  async getOrganizationFlags(ctx: Context): ServerResultAsync<string[]> {
    const org = this.organizationActorFromCtx(ctx);
    if (org.isErr()) return err(org.error);
    const actor = org.value;

    return this.repository.auth.getOrganizationFlags(actor.userId, actor.organizationId);
  }

  async setFlags(flags: string[], ctx: Context): ServerResultAsync<string[]> {
    posthogCapture({
      distinctId: ctx.actor.userId,
      event: "flags_set",
    });
    return this.repository.auth.setFlags(ctx.actor.userId, flags);
  }

  async setOrganizationFlags(flags: string[], ctx: Context): ServerResultAsync<string[]> {
    const org = this.organizationActorFromCtx(ctx);
    if (org.isErr()) return err(org.error);
    const actor = org.value;

    posthogCapture({
      distinctId: actor.userId,
      event: "organization_flags_set",
      properties: {
        organizationId: actor.organizationId,
      },
    });

    return this.repository.auth.setOrganizationFlags(actor.userId, actor.organizationId, flags);
  }

  async listAdminWaitlist(): ServerResultAsync<WaitlistOutput[]> {
    return this.repository.auth.listAdminWaitlist();
  }

  async listWaitlist(ctx: Context): ServerResultAsync<Waitlist[]> {
    return this.repository.auth.listWaitlist(ctx.actor.userId);
  }

  async addToWaitlist({ email }: { email: string }): ServerResultAsync<WaitlistOutput> {
    return this.repository.auth.addToWaitlist(email);
  }

  async inviteFromWaitlist({ id }: { id: string }): ServerResultAsync<Waitlist> {
    const waitlist = await this.repository.auth.inviteFromWaitlist(id);
    if (waitlist.isErr()) return err(waitlist.error);
    if (!waitlist.value.code) return this.repository.auth.error("BAD_REQUEST");
    if (!waitlist.value.email) return this.repository.auth.error("BAD_REQUEST");
    await this.service.email.sendWaitlistInvite(waitlist.value.email, waitlist.value.code);
    return ok(waitlist.value);
  }

  async inviteToWaitlist(
    { email, name }: { email: string; name?: string },
    ctx: Context
  ): ServerResultAsync<Waitlist> {
    const count = await this.repository.auth.getUserWaitlistCount(ctx.user.id);
    if (count.isErr()) return err(count.error);
    if (count.value >= 3) return this.repository.auth.error("BAD_REQUEST", "Run out of invites");
    const waitlist = await this.repository.auth.inviteToWaitlist({
      email,
      userId: ctx.user.id,
      name,
    });
    if (waitlist.isErr()) return err(waitlist.error);
    if (!waitlist.value.code) return this.repository.auth.error("BAD_REQUEST");
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
  }

  async createInvitationCode(
    { name }: { name?: string },
    ctx: Context
  ): ServerResultAsync<Waitlist> {
    posthogCapture({
      distinctId: ctx.actor.userId,
      event: "waitlist_invitation_code_created",
      properties: {
        name,
      },
    });
    return this.repository.auth.createInvitationCode({ userId: ctx.actor.userId, name });
  }

  async joinWaitlist({ email }: { email: string }): ServerResultAsync<WaitlistOutput> {
    const waitlist = await this.repository.auth.joinWaitlist(email);
    if (waitlist.isErr()) return err(waitlist.error);
    await this.service.email.sendWaitlistConfirmation(email);
    return ok(waitlist.value);
  }

  async removeFromWaitlist({ id }: { id: string }): ServerResultAsync<WaitlistOutput> {
    return this.repository.auth.removeFromWaitlist(id);
  }

  async validateWaitlistCode(code: string): ServerResultAsync<{ status: string }> {
    return this.repository.auth.validateWaitlistCode(code);
  }

  async createAccountClaimCode({
    userId,
    expiresInHours,
  }: {
    userId: string;
    expiresInHours?: number;
  }): ServerResultAsync<AccountClaim> {
    return this.repository.auth.createAccountClaimCode({ userId, expiresInHours });
  }

  async listAccountClaims(): ServerResultAsync<AccountClaimOutput[]> {
    return this.repository.auth.listAccountClaims();
  }

  async getMyAccountClaimStatus(ctx: Context): ServerResultAsync<AccountClaim | null> {
    return this.repository.auth.findPendingAccountClaimForUser(ctx.actor.userId);
  }

  async setMyAccountClaimEmail(
    { email }: { email: string },
    ctx: Context
  ): ServerResultAsync<{ status: boolean }> {
    return this.repository.auth.setAccountClaimEmail({ userId: ctx.actor.userId, email });
  }

  async acceptMyAccountClaim(ctx: Context): ServerResultAsync<{ status: boolean }> {
    const pendingClaim = await this.repository.auth.findPendingAccountClaimForUser(ctx.user.id);
    if (pendingClaim.isErr()) return err(pendingClaim.error);

    const accepted = await this.repository.auth.acceptAccountClaim(ctx.user.id);
    if (accepted.isErr()) return err(accepted.error);

    if (pendingClaim.value) {
      const billingService = this.getBillingService();
      if (billingService) {
        await billingService.createUserHook({ user: ctx.user });
      }
    }

    return ok(accepted.value);
  }

  async generateAccountClaimMagicLink({
    claimId,
    email,
  }: {
    claimId: string;
    email?: string;
  }): ServerResultAsync<AccountClaimMagicLinkOutput> {
    const claim = await this.repository.auth.findAccountClaimById(claimId);
    if (claim.isErr()) return err(claim.error);
    if (!claim.value) return this.repository.auth.error("NOT_FOUND", "Claim not found");
    if (!claim.value.claimUserId)
      return this.repository.auth.error("BAD_REQUEST", "Claim has no user");
    if (claim.value.status !== "INVITED") {
      return this.repository.auth.error("BAD_REQUEST", "Claim is not pending");
    }
    if (claim.value.expiresAt && claim.value.expiresAt < new Date()) {
      return this.repository.auth.error("BAD_REQUEST", "Claim is expired");
    }

    const targetEmail = email ?? claim.value.claimedEmail ?? undefined;
    if (!targetEmail) {
      return this.repository.auth.error("BAD_REQUEST", "Email required to generate magic link");
    }

    const setEmail = await this.repository.auth.setAccountClaimEmail({
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
      return this.repository.auth.error("INTERNAL_SERVER_ERROR", "Failed to generate magic link");
    }

    const latest = await this.repository.auth.latestAccountClaimMagicLink(claimId);
    if (latest.isErr()) return err(latest.error);
    if (!latest.value) return this.repository.auth.error("INTERNAL_SERVER_ERROR");
    return ok(latest.value);
  }

  async listAccountClaimMagicLinks({
    claimId,
  }: {
    claimId: string;
  }): ServerResultAsync<AccountClaimMagicLinkOutput[]> {
    return this.repository.auth.listAccountClaimMagicLinks(claimId);
  }
}
