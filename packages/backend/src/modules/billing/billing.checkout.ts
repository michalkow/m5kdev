import { randomUUID } from "node:crypto";
import type { PublicExperience } from "@m5kdev/commons/modules/app/experience.schema";
import type Stripe from "stripe";
import { z } from "zod";
import type { OrganizationActor } from "../../base/base.actor";
import { ExperienceContextError, type ExperienceRegistry } from "../../experience";
import { EXPERIENCE_FLOW_PARAMETER, type ExperienceFlowSigner } from "../../experience-flows";
import type { Session, User } from "../auth/auth.lib";
import type { AuthRequest } from "../auth/auth.middleware";
import type { PortalSessionResolver } from "./billing.portal";

export const checkoutStartInputSchema = z.strictObject({
  priceId: z.string().min(1),
  returnPath: z.string().optional(),
});
export type CheckoutStartInput = z.infer<typeof checkoutStartInputSchema>;
export type BillingBrowserContext = {
  user: Pick<User, "id" | "email" | "name">;
  session?: Pick<Session, "id" | "activeOrganizationId"> | null;
  actor?: OrganizationActor;
  experience?: PublicExperience;
  req?: Pick<AuthRequest, "headers">;
};
export type CheckoutOverlayContext = Readonly<{
  experience: PublicExperience;
  environment: CheckoutFlow["environment"];
  organization: Readonly<{ id: string; currency: string; locale: string | null }>;
  customerId: string;
  source: Readonly<{ kind: "browser" } & Pick<CheckoutFlow, "userId" | "sessionId" | "memberId">>;
  checkout: Readonly<{
    priceId: string;
    quantity: number;
    trialDays?: number;
    collectPaymentMethod: boolean;
  }>;
}>;
export type CheckoutSessionResolver = (
  context: CheckoutOverlayContext
) =>
  | Partial<Stripe.Checkout.SessionCreateParams>
  | Promise<Partial<Stripe.Checkout.SessionCreateParams>>;
export type BillingPresentation = {
  registry?: ExperienceRegistry;
  flows?: ExperienceFlowSigner;
  resolveCheckoutSessionCreate?: CheckoutSessionResolver;
  resolveBillingPortalSessionCreate?: PortalSessionResolver;
};
export type CheckoutPresentation = {
  experience: PublicExperience;
  destination: string;
  userId: string;
  sessionId: string;
};

const checkoutFlowSchema = z.strictObject({
  v: z.literal(1),
  kind: z.literal("checkout"),
  source: z.literal("browser"),
  organizationId: z.string().min(1),
  memberId: z.string().min(1),
  userId: z.string().min(1),
  sessionId: z.string().min(1),
  customerId: z.string().min(1),
  environment: z.enum(["production", "sandbox"]),
  nonce: z.string().uuid(),
});
export type CheckoutFlow = z.infer<typeof checkoutFlowSchema>;
export const checkoutReturnInputSchema = z.strictObject({
  flow: z.string().min(1).optional(),
  experienceFlow: z.string().min(1).optional(),
  checkoutSessionId: z.string().min(1).optional(),
});
export type CheckoutReturnInput = z.infer<typeof checkoutReturnInputSchema>;
/** Route-owned outcome; it is never selected from the callback query. */
export const checkoutCompletionInputSchema = checkoutReturnInputSchema.extend({
  kind: z.enum(["success", "cancel"]),
});
export type CheckoutCompletionInput = z.infer<typeof checkoutCompletionInputSchema>;
export const checkoutNonceKey = "m5kdevCheckoutNonce";
export const checkoutVersionKey = "m5kdevCheckoutFlow";
const purpose = { success: "billing-checkout-success", cancel: "billing-checkout-cancel" } as const;
const token = (flow: CheckoutFlow) =>
  JSON.stringify([
    flow.v,
    flow.kind,
    flow.source,
    flow.organizationId,
    flow.memberId,
    flow.userId,
    flow.sessionId,
    flow.customerId,
    flow.environment,
    flow.nonce,
  ]);

export function createCheckoutReturnUrls(input: {
  flows: ExperienceFlowSigner;
  presentation: CheckoutPresentation;
  organizationId: string;
  memberId: string;
  customerId: string;
  environment: CheckoutFlow["environment"];
}) {
  const { flows, presentation, ...identity } = input;
  const flow = checkoutFlowSchema.parse({
    v: 1,
    kind: "checkout",
    source: "browser",
    ...identity,
    userId: presentation.userId,
    sessionId: presentation.sessionId,
    nonce: randomUUID(),
  });
  const encoded = Buffer.from(JSON.stringify(flow)).toString("base64url");
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  const make = (kind: keyof typeof purpose) => {
    const url = new URL(`/stripe/${kind}`, presentation.experience.apiOrigin);
    url.searchParams.set("flow", encoded);
    url.searchParams.set(
      EXPERIENCE_FLOW_PARAMETER,
      flows.sign({
        purpose: purpose[kind],
        token: token(flow),
        experience: presentation.experience,
        destination: presentation.destination,
        expiresAt,
      })
    );
    if (kind === "success") url.searchParams.set("checkoutSessionId", "{CHECKOUT_SESSION_ID}");
    return url.href.replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}");
  };
  return {
    successUrl: make("success"),
    cancelUrl: make("cancel"),
    metadata: { [checkoutNonceKey]: flow.nonce, [checkoutVersionKey]: "1" },
  };
}

export function verifyCheckoutReturn(
  input: CheckoutReturnInput,
  kind: keyof typeof purpose,
  flows: ExperienceFlowSigner
) {
  if (!input.flow || !input.experienceFlow || !/^[A-Za-z0-9_-]+$/.test(input.flow))
    throw new ExperienceContextError("Missing Checkout continuation");
  const bytes = Buffer.from(input.flow, "base64url");
  if (bytes.toString("base64url") !== input.flow)
    throw new ExperienceContextError("Invalid Checkout continuation");
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString());
  } catch {
    throw new ExperienceContextError("Invalid Checkout continuation");
  }
  const parsed = checkoutFlowSchema.safeParse(raw);
  if (!parsed.success) throw new ExperienceContextError("Invalid Checkout continuation");
  const flow = parsed.data;
  const bound = flows.verify({
    proof: input.experienceFlow,
    purpose: purpose[kind],
    token: token(flow),
  });
  return { ...bound, flow };
}
