import { err, ok } from "neverthrow";
import type {
  AccountClaim,
  AccountClaimMagicLinkOutput,
  AccountClaimOutput,
  Waitlist,
  WaitlistOutput,
} from "#modules/auth/auth.dto";
import type { User } from "#modules/auth/auth.lib";
import type { AuthRepository } from "#modules/auth/auth.repository";
import type { ServerResultAsync } from "#modules/base/base.dto";
import { BaseService } from "#modules/base/base.service";
import type { BillingService } from "#modules/billing/billing.service";
import type { EmailService } from "#modules/email/email.service";
import { posthogCapture } from "#utils/posthog";

type AuthServiceDependencies =
  | { email: EmailService }
  | { email: EmailService; billing: BillingService };

export class AuthService extends BaseService<{ auth: AuthRepository }, AuthServiceDependencies> {
  private getBillingService(): BillingService | null {
    if (!("billing" in this.service)) return null;
    return this.service.billing;
  }

  async getUserWaitlistCount({ user }: { user: User }): ServerResultAsync<number> {
    if (user.role === "admin") return ok(0);
    return this.repository.auth.getUserWaitlistCount(user.id);
  }

  async getOnboarding({ user }: { user: User }): ServerResultAsync<number> {
    return this.repository.auth.getOnboarding(user.id);
  }

  async setOnboarding(onboarding: number, { user }: { user: User }): ServerResultAsync<number> {
    posthogCapture({
      distinctId: user.id,
      event: "onboarding_set",
      properties: {
        onboarding,
      },
    });
    return this.repository.auth.setOnboarding(user.id, onboarding);
  }

  async getPreferences({ user }: { user: User }): ServerResultAsync<Record<string, unknown>> {
    return this.repository.auth.getPreferences(user.id);
  }

  async setPreferences(
    preferences: Record<string, unknown>,
    { user }: { user: User }
  ): ServerResultAsync<Record<string, unknown>> {
    posthogCapture({
      distinctId: user.id,
      event: "preferences_set",
    });
    return this.repository.auth.setPreferences(user.id, preferences);
  }

  async getMetadata({ user }: { user: User }): ServerResultAsync<Record<string, unknown>> {
    return this.repository.auth.getMetadata(user.id);
  }

  async setMetadata(
    metadata: Record<string, unknown>,
    { user }: { user: User }
  ): ServerResultAsync<Record<string, unknown>> {
    posthogCapture({
      distinctId: user.id,
      event: "metadata_set",
    });
    return this.repository.auth.setMetadata(user.id, metadata);
  }

  async getFlags({ user }: { user: User }): ServerResultAsync<string[]> {
    return this.repository.auth.getFlags(user.id);
  }

  async setFlags(flags: string[], { user }: { user: User }): ServerResultAsync<string[]> {
    posthogCapture({
      distinctId: user.id,
      event: "flags_set",
    });
    return this.repository.auth.setFlags(user.id, flags);
  }

  async listAdminWaitlist(): ServerResultAsync<WaitlistOutput[]> {
    return this.repository.auth.listAdminWaitlist();
  }

  async listWaitlist({ user }: { user: User }): ServerResultAsync<Waitlist[]> {
    return this.repository.auth.listWaitlist(user.id);
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
    { user }: { user: User }
  ): ServerResultAsync<Waitlist> {
    const count = await this.repository.auth.getUserWaitlistCount(user.id);
    if (count.isErr()) return err(count.error);
    if (count.value >= 3) return this.repository.auth.error("BAD_REQUEST", "Run out of invites");
    const waitlist = await this.repository.auth.inviteToWaitlist({ email, userId: user.id, name });
    if (waitlist.isErr()) return err(waitlist.error);
    if (!waitlist.value.code) return this.repository.auth.error("BAD_REQUEST");
    await this.service.email.sendWaitlistUserInvite(email, waitlist.value.code, user.name, name);
    posthogCapture({
      distinctId: user.id,
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
    { user }: { user: User }
  ): ServerResultAsync<Waitlist> {
    posthogCapture({
      distinctId: user.id,
      event: "waitlist_invitation_code_created",
      properties: {
        name,
      },
    });
    return this.repository.auth.createInvitationCode({ userId: user.id, name });
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

  async getMyAccountClaimStatus({ user }: { user: User }): ServerResultAsync<AccountClaim | null> {
    return this.repository.auth.findPendingAccountClaimForUser(user.id);
  }

  async setMyAccountClaimEmail(
    { email }: { email: string },
    { user }: { user: User }
  ): ServerResultAsync<{ status: boolean }> {
    return this.repository.auth.setAccountClaimEmail({ userId: user.id, email });
  }

  async acceptMyAccountClaim({ user }: { user: User }): ServerResultAsync<{ status: boolean }> {
    const pendingClaim = await this.repository.auth.findPendingAccountClaimForUser(user.id);
    if (pendingClaim.isErr()) return err(pendingClaim.error);

    const accepted = await this.repository.auth.acceptAccountClaim(user.id);
    if (accepted.isErr()) return err(accepted.error);

    if (pendingClaim.value) {
      const billingService = this.getBillingService();
      if (billingService) {
        await billingService.createUserHook({ user });
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
