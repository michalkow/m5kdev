import { randomUUID } from "node:crypto";
import type { PublicExperience } from "@m5kdev/commons/modules/app/experience.schema";
import { stripeEnvironmentSchema } from "@m5kdev/commons/modules/billing/billing.schema";
import type Stripe from "stripe";
import { z } from "zod";
import { ExperienceContextError } from "../../experience";
import { EXPERIENCE_FLOW_PARAMETER, type ExperienceFlowSigner } from "../../experience-flows";
import type { CheckoutOverlayContext } from "./billing.checkout";

export const portalStartInputSchema = z.strictObject({ returnPath: z.string().optional() });
export type PortalStartInput = z.infer<typeof portalStartInputSchema>;
export const portalReturnInputSchema = z.strictObject({
  flow: z.string().min(1),
  experienceFlow: z.string().min(1),
});
export type PortalReturnInput = z.infer<typeof portalReturnInputSchema>;
const browserPortalSourceSchema = z.strictObject({
  kind: z.literal("browser"),
  userId: z.string().min(1),
  sessionId: z.string().min(1),
  memberId: z.string().min(1),
});
const portalSourceSchema = z.discriminatedUnion("kind", [
  browserPortalSourceSchema,
  z.strictObject({
    kind: z.literal("trial-ending"),
    eventId: z.string().min(1),
    subscriptionId: z.string().min(1),
  }),
]);
export type PortalSource = z.infer<typeof portalSourceSchema>;
export type PortalPresentation = {
  experience: PublicExperience;
  destination: string;
  source: PortalSource;
};
export type PortalOverlayContext = Readonly<
  Omit<CheckoutOverlayContext, "checkout" | "source"> & { source: Readonly<PortalSource> }
>;
export type PortalSessionResolver = (
  context: PortalOverlayContext
) =>
  | Partial<Stripe.BillingPortal.SessionCreateParams>
  | Promise<Partial<Stripe.BillingPortal.SessionCreateParams>>;
export type BrowserPortalPresentation = Omit<PortalPresentation, "source"> & {
  source: z.infer<typeof browserPortalSourceSchema>;
};
const portalFlowSchema = z.strictObject({
  v: z.literal(1),
  kind: z.literal("portal"),
  organizationId: z.string().min(1),
  customerId: z.string().min(1),
  environment: stripeEnvironmentSchema,
  nonce: z.string().uuid(),
  source: portalSourceSchema,
});
export type PortalFlow = z.infer<typeof portalFlowSchema>;
const token = (flow: PortalFlow) =>
  JSON.stringify([
    flow.v,
    flow.kind,
    flow.organizationId,
    flow.customerId,
    flow.environment,
    flow.nonce,
    flow.source.kind,
    ...(flow.source.kind === "browser"
      ? [flow.source.userId, flow.source.sessionId, flow.source.memberId]
      : [flow.source.eventId, flow.source.subscriptionId]),
  ]);

export function createPortalReturnUrl(input: {
  flows: ExperienceFlowSigner;
  presentation: PortalPresentation;
  organizationId: string;
  customerId: string;
  environment: PortalFlow["environment"];
}) {
  const { flows, presentation, ...identity } = input;
  const flow = portalFlowSchema.parse({
    v: 1,
    kind: "portal",
    ...identity,
    nonce: randomUUID(),
    source: presentation.source,
  });
  const url = new URL("/stripe/portal/return", presentation.experience.apiOrigin);
  url.searchParams.set("flow", Buffer.from(JSON.stringify(flow)).toString("base64url"));
  url.searchParams.set(
    EXPERIENCE_FLOW_PARAMETER,
    flows.sign({
      purpose: "billing-portal-return",
      token: token(flow),
      experience: presentation.experience,
      destination: presentation.destination,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    })
  );
  return url.href;
}

export function verifyPortalReturn(input: PortalReturnInput, flows: ExperienceFlowSigner) {
  if (!/^[A-Za-z0-9_-]+$/.test(input.flow))
    throw new ExperienceContextError("Invalid Portal continuation");
  const bytes = Buffer.from(input.flow, "base64url");
  if (bytes.toString("base64url") !== input.flow)
    throw new ExperienceContextError("Invalid Portal continuation");
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString());
  } catch {
    throw new ExperienceContextError("Invalid Portal continuation");
  }
  const parsed = portalFlowSchema.safeParse(raw);
  if (!parsed.success) throw new ExperienceContextError("Invalid Portal continuation");
  const flow = parsed.data;
  const bound = flows.verify({
    proof: input.experienceFlow,
    purpose: "billing-portal-return",
    token: token(flow),
  });
  return { ...bound, flow };
}
