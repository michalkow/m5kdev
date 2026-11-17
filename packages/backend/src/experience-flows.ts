import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { PublicExperience } from "@m5kdev/commons/modules/app/experience.schema";
import { z } from "zod";
import { ExperienceContextError, type ExperienceRegistry } from "./experience";

export {
  EXPERIENCE_FLOW_HEADER,
  EXPERIENCE_FLOW_PARAMETER,
} from "@m5kdev/commons/modules/app/experience.constants";

const legacyPolicySchema = z
  .object({
    experience: z.string().min(1),
    issuedBefore: z.date(),
    acceptUntil: z.date(),
  })
  .refine(
    (policy) =>
      policy.issuedBefore.getTime() <= Date.now() && policy.acceptUntil > policy.issuedBefore,
    {
      message: "Legacy flows require a past issuance cutoff and a later acceptance deadline",
    }
  );

/** Explicit, time-bounded admission of existing tokens from one pre-cutover Experience. */
export type LegacyExperienceFlowPolicy = z.input<typeof legacyPolicySchema>;

const flowSchema = z.object({
  purpose: z.string().min(1),
  subject: z.string().length(64),
  experienceId: z.string().min(1),
  destination: z.url(),
  expiresAt: z.number().int().positive(),
});

/** Immutable app infrastructure; owning flows still enforce their token/resource authority. */
export class ExperienceFlowSigner {
  private readonly secret: string;
  private readonly legacy?: Readonly<{
    experience: PublicExperience;
    issuedBefore: number;
    acceptUntil: number;
  }>;

  constructor(
    private readonly registry: ExperienceRegistry,
    secret: string,
    options: { legacyPolicy?: LegacyExperienceFlowPolicy } = {}
  ) {
    this.secret = z.string().min(32).parse(secret);
    if (options.legacyPolicy) {
      const policy = legacyPolicySchema.parse(options.legacyPolicy);
      this.legacy = Object.freeze({
        experience: registry.get(policy.experience),
        // Verification JWT issuance has second precision. Fail closed for the cutover second.
        issuedBefore: Math.floor(policy.issuedBefore.getTime() / 1000) * 1000,
        acceptUntil: policy.acceptUntil.getTime(),
      });
    }
    Object.freeze(this);
  }

  sign(input: {
    purpose: string;
    token: string;
    experience: PublicExperience;
    destination: string;
    expiresAt: number;
  }): string {
    const payload = flowSchema.parse({
      purpose: input.purpose,
      subject: this.digest(input.token),
      experienceId: input.experience.id,
      destination: this.registry.destination(input.experience, input.destination),
      expiresAt: input.expiresAt,
    });
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${this.signature(body).toString("base64url")}`;
  }

  verify(input: {
    proof: string;
    purpose: string;
    token: string;
    experience?: PublicExperience;
    destination?: string;
  }) {
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(input.proof))
      throw new ExperienceContextError("Invalid recovery continuation");
    const [body, encodedSignature] = input.proof.split(".");
    const signature = Buffer.from(encodedSignature, "base64url");
    if (
      signature.toString("base64url") !== encodedSignature ||
      Buffer.from(body, "base64url").toString("base64url") !== body
    )
      throw new ExperienceContextError("Invalid recovery continuation");
    const expected = this.signature(body);
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected))
      throw new ExperienceContextError("Invalid recovery continuation");
    let data: unknown;
    try {
      data = JSON.parse(Buffer.from(body, "base64url").toString());
    } catch {
      throw new ExperienceContextError("Invalid recovery continuation");
    }
    const parsed = flowSchema.safeParse(data);
    if (!parsed.success) throw new ExperienceContextError("Invalid recovery continuation");
    const flow = parsed.data;
    const experience = this.registry.get(flow.experienceId);
    const destination = this.registry.destination(experience, flow.destination);
    if (
      flow.expiresAt <= Date.now() ||
      flow.purpose !== input.purpose ||
      flow.subject !== this.digest(input.token) ||
      (input.experience && experience.id !== input.experience.id) ||
      (input.destination && destination !== input.destination)
    )
      throw new ExperienceContextError("Invalid or expired recovery continuation");
    return { experience, destination, expiresAt: flow.expiresAt };
  }

  /** Eligibility only: the owning adapter must obtain trusted issuance data and validate/consume its token. */
  verifyLegacy(input: { issuedAt: number; experience?: PublicExperience; destination?: string }) {
    const policy = this.legacy;
    if (
      !policy ||
      Date.now() >= policy.acceptUntil ||
      !Number.isFinite(input.issuedAt) ||
      input.issuedAt >= policy.issuedBefore
    )
      throw new ExperienceContextError("Flow is outside the legacy issuance window");
    const experience = this.registry.get(policy.experience.id);
    if (input.experience && input.experience.id !== experience.id)
      throw new ExperienceContextError("Conflicting legacy Experience");
    const destination =
      input.destination === undefined
        ? undefined
        : this.registry.destination(experience, input.destination);
    return { experience, destination };
  }

  private digest(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private signature(body: string) {
    return createHmac("sha256", this.secret).update(`m5kdev-experience-flow:${body}`).digest();
  }
}
