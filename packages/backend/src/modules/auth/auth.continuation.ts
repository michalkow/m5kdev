import type { PublicExperience } from "@m5kdev/commons/modules/app/experience.schema";
import { z } from "zod";
import { ExperienceContextError, type ExperienceRegistry } from "../../experience";
import { EXPERIENCE_FLOW_PARAMETER, type ExperienceFlowSigner } from "../../experience-flows";

export type AuthPresentation = { registry?: ExperienceRegistry; flows?: ExperienceFlowSigner };

type AuthFlowContext = {
  experience?: PublicExperience;
  requestHeaders?: Parameters<ExperienceRegistry["resolveRequest"]>[0]["headers"];
};

/** Issuance remains owned by Auth; the signer binds presentation, never resource authority. */
export function issueAuthFlow(
  input: AuthPresentation & {
    experience?: PublicExperience;
    purpose: string;
    token: string;
    path: string;
    expiresAt: Date;
    webOrigin?: string;
  }
) {
  const experience = input.registry?.require(input.experience);
  const origin = experience?.webOrigin ?? input.webOrigin;
  if (!origin) throw new ExperienceContextError("Public web origin is not configured");
  const destination =
    experience && input.registry
      ? input.registry.destination(experience, input.path)
      : new URL(input.path, origin).href;
  const link = new URL(destination);
  if (input.registry?.strict) {
    if (!input.flows || !experience)
      throw new ExperienceContextError("Experience flow signing is not configured");
    link.searchParams.set(
      EXPERIENCE_FLOW_PARAMETER,
      input.flows.sign({
        purpose: input.purpose,
        token: input.token,
        experience,
        destination,
        expiresAt: input.expiresAt.getTime(),
      })
    );
  }
  return { url: link.href, experience };
}

export function verifyAuthFlow(
  input: AuthPresentation &
    AuthFlowContext & {
      purpose: string;
      token: string;
      proof?: string;
      issuedAt: Date;
      path?: string;
    }
) {
  if (!input.registry?.strict && input.proof === undefined) {
    const experience = input.registry?.require(input.experience);
    if (experience && input.requestHeaders)
      input.registry?.validateBoundRequest(experience, { headers: input.requestHeaders });
    return experience;
  }
  if (!input.flows || !input.registry)
    throw new ExperienceContextError("Experience flow signing is not configured");
  const bound =
    input.proof === undefined
      ? input.flows.verifyLegacy({
          issuedAt: input.issuedAt.getTime(),
          experience: input.experience,
          destination: input.path,
        })
      : input.flows.verify({
          proof: input.proof,
          purpose: input.purpose,
          token: input.token,
          experience: input.experience,
        });
  if (
    input.proof !== undefined &&
    input.path !== undefined &&
    bound.destination !== input.registry.destination(bound.experience, input.path)
  )
    throw new ExperienceContextError("Invalid continuation destination");
  if (input.requestHeaders)
    input.registry.validateBoundRequest(bound.experience, { headers: input.requestHeaders });
  return bound.experience;
}

export const signupContinuationSchema = z
  .object({
    organizationInvitationCode: z.string().optional(),
    waitlistInvitationCode: z.string().optional(),
    experienceFlow: z.string().optional(),
  })
  .strict();
export type SignupContinuation = z.infer<typeof signupContinuationSchema>;

export const accountClaimSubject = (
  claim: Pick<typeof import("./auth.db").accountClaims.$inferSelect, "id" | "claimUserId">
) => JSON.stringify([claim.id, claim.claimUserId]);
export const accountClaimPath = (id: string) =>
  `/claim-account?${new URLSearchParams({ claim: id })}`;

/** Shared owning-flow rules used by AuthService and Better Auth's database adapter. */
export function verifyInvitationContinuation(
  input: AuthPresentation &
    AuthFlowContext & {
      invitation: typeof import("./auth.db").invitations.$inferSelect;
      proof?: string;
    }
) {
  const row = input.invitation;
  if (row.status !== "pending" || !row.memberId || row.expiresAt.getTime() <= Date.now())
    throw new ExperienceContextError("Invitation is invalid or has expired");
  return verifyAuthFlow({
    ...input,
    purpose: "organization-invitation",
    token: row.id,
    issuedAt: row.createdAt,
  });
}

export function verifyWaitlistContinuation(
  input: AuthPresentation &
    AuthFlowContext & {
      entry: typeof import("./auth.db").waitlist.$inferSelect;
      proof?: string;
    }
) {
  const row = input.entry;
  if (
    !row.code ||
    row.status !== "INVITED" ||
    !row.expiresAt ||
    row.expiresAt.getTime() <= Date.now()
  )
    throw new ExperienceContextError("Waitlist code is invalid or has expired");
  return verifyAuthFlow({
    ...input,
    purpose: "waitlist-signup",
    token: row.code,
    issuedAt: row.updatedAt ?? row.createdAt,
    path: `/signup?${new URLSearchParams({ code: row.code, ...(row.email ? { email: row.email } : {}) })}`,
  });
}

export function verifyClaimContinuation(
  input: AuthPresentation &
    AuthFlowContext & {
      claim: Pick<
        typeof import("./auth.db").accountClaims.$inferSelect,
        "id" | "claimUserId" | "status" | "expiresAt" | "createdAt"
      >;
      userId: string;
      proof?: string;
    }
) {
  const row = input.claim;
  if (
    row.claimUserId !== input.userId ||
    row.status !== "INVITED" ||
    !row.expiresAt ||
    row.expiresAt.getTime() <= Date.now()
  )
    throw new ExperienceContextError("Account claim is invalid or has expired");
  return verifyAuthFlow({
    ...input,
    purpose: "account-claim",
    token: accountClaimSubject(row),
    issuedAt: row.createdAt,
    path: accountClaimPath(row.id),
  });
}
