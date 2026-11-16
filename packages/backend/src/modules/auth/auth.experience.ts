import type { PublicExperience } from "@m5kdev/commons/modules/app/experience.schema";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, addOAuthServerContext, createAuthMiddleware } from "better-auth/api";
import { z } from "zod";
import { ExperienceContextError, type ExperienceRegistry } from "../../experience";
import {
  EXPERIENCE_FLOW_HEADER,
  EXPERIENCE_FLOW_PARAMETER,
  type ExperienceFlowSigner,
} from "../../experience-flows";

export function bindAuthRecoveryLink(input: {
  registry: ExperienceRegistry;
  flows?: ExperienceFlowSigner;
  request?: Request;
  url: string;
  token: string;
  purpose: "reset-password" | "verify-email";
  expiresIn: number;
}) {
  const experience = input.registry.require(resolveAuthExperience(input.registry, input.request));
  if (!input.flows) throw new ExperienceContextError("Experience flow signing is not configured");
  const source = new URL(input.url);
  const link = new URL(experience.apiOrigin);
  link.pathname = source.pathname;
  link.search = source.search;
  const destination = input.registry.destination(
    experience,
    link.searchParams.get("callbackURL") ||
      (input.purpose === "reset-password" ? "/reset-password" : "/")
  );
  const proof = input.flows.sign({
    purpose: input.purpose,
    token: input.token,
    experience,
    destination,
    expiresAt: Date.now() + input.expiresIn * 1000,
  });
  const callback = new URL(destination);
  callback.searchParams.set(EXPERIENCE_FLOW_PARAMETER, proof);
  link.searchParams.set("callbackURL", callback.href);
  return { url: link.href, experience };
}

/** Resolve WHATWG auth requests through the same app-owned host/Origin boundary. */
export function resolveAuthExperience(
  registry: ExperienceRegistry,
  request?: Request,
  headers?: Headers
) {
  const values = Object.fromEntries((headers ?? request?.headers ?? new Headers()).entries());
  if (!values.host && request) values.host = new URL(request.url).host;
  return registry.resolveRequest({ headers: values });
}

/** Eligibility gate only; upstream jwtVerify still authenticates this JWT before any effect. */
function verificationIssuedAt(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return z.object({ iat: z.number().int().positive() }).parse(payload).iat * 1000;
  } catch {
    throw new ExperienceContextError("Invalid legacy verification issuance");
  }
}

export function experienceAuthPlugin(
  registry: ExperienceRegistry,
  flows?: ExperienceFlowSigner
): BetterAuthPlugin {
  const validateBoundTransport = (
    experience: PublicExperience,
    request?: Request,
    headers?: Headers
  ) => {
    const values = new Headers(headers ?? request?.headers);
    if (!values.has("origin")) values.set("origin", experience.webOrigin);
    const selected = resolveAuthExperience(registry, request, values);
    if (selected?.id !== experience.id)
      throw new ExperienceContextError("Conflicting recovery transport");
  };
  return {
    id: "m5kdev-experience",
    hooks: {
      before: [
        {
          matcher: () => true,
          handler: createAuthMiddleware(async (ctx) => {
            try {
              const experience = resolveAuthExperience(registry, ctx.request, ctx.headers);
              const acceptLegacy = async (
                token: string,
                purpose: "reset-password" | "verify-email",
                destination?: string
              ) => {
                if (!flows) throw new ExperienceContextError("Missing recovery continuation");
                let issuedAt: number;
                if (purpose === "verify-email") issuedAt = verificationIssuedAt(token);
                else {
                  const record = await ctx.context.internalAdapter.findVerificationValue(
                    `reset-password:${token}`
                  );
                  issuedAt = record?.createdAt ? new Date(record.createdAt).getTime() : Number.NaN;
                }
                const bound = flows.verifyLegacy({ issuedAt, experience, destination });
                validateBoundTransport(bound.experience, ctx.request, ctx.headers);
                return bound.destination;
              };
              if (ctx.path === "/reset-password") {
                const proof = ctx.headers?.get(EXPERIENCE_FLOW_HEADER);
                const token = ctx.body?.token || ctx.query?.token;
                if (typeof token !== "string")
                  throw new ExperienceContextError("Missing recovery token");
                if (!proof) {
                  await acceptLegacy(token, "reset-password");
                  return;
                }
                if (!flows) throw new ExperienceContextError("Missing recovery continuation");
                const bound = flows.verify({ proof, purpose: "reset-password", token, experience });
                validateBoundTransport(bound.experience, ctx.request, ctx.headers);
                return;
              }
              if (ctx.path === "/reset-password/:token" || ctx.path === "/verify-email") {
                if (!flows || typeof ctx.query?.callbackURL !== "string")
                  throw new ExperienceContextError("Missing recovery continuation");
                const token = ctx.path === "/verify-email" ? ctx.query.token : ctx.params?.token;
                if (typeof token !== "string")
                  throw new ExperienceContextError("Invalid recovery token");
                let callback: URL;
                try {
                  // Resolve syntax here; legacy returns are canonicalized against their fixed Experience below.
                  callback = new URL(ctx.query.callbackURL, ctx.context.baseURL);
                } catch {
                  throw new ExperienceContextError("Invalid recovery destination");
                }
                const proofs = callback.searchParams.getAll(EXPERIENCE_FLOW_PARAMETER);
                if (proofs.length === 0) {
                  const destination = await acceptLegacy(
                    token,
                    ctx.path === "/verify-email" ? "verify-email" : "reset-password",
                    ctx.query.callbackURL
                  );
                  return { context: { query: { ...ctx.query, callbackURL: destination } } };
                }
                if (proofs.length !== 1)
                  throw new ExperienceContextError("Missing recovery continuation");
                callback.searchParams.delete(EXPERIENCE_FLOW_PARAMETER);
                const bound = flows.verify({
                  proof: proofs[0],
                  purpose: ctx.path === "/verify-email" ? "verify-email" : "reset-password",
                  token,
                  experience,
                  destination: callback.href,
                });
                validateBoundTransport(bound.experience, ctx.request, ctx.headers);
                return;
              }
              const sensitive =
                /^\/(sign-in|sign-up|link-social|link-account|request-password-reset|send-verification-email)/.test(
                  ctx.path
                );
              if (!experience && !sensitive) return;
              const selected = registry.require(experience);
              const body = { ...ctx.body };
              for (const key of [
                "callbackURL",
                "errorCallbackURL",
                "newUserCallbackURL",
                "redirectTo",
              ]) {
                if (typeof body[key] === "string")
                  body[key] = registry.destination(selected, body[key]);
              }
              if (
                ["/sign-in/social", "/sign-in/oauth2", "/link-social", "/link-account"].includes(
                  ctx.path
                )
              ) {
                await addOAuthServerContext({ experienceId: selected.id });
              }
              // Direct auth.api calls have headers but no Request. Supply the same
              // validated transport context to upstream email callbacks.
              const request =
                ctx.request ??
                new Request(`${ctx.context.baseURL}${ctx.path}`, {
                  method: ctx.method ?? "POST",
                  headers: ctx.headers,
                });
              return { context: { request, ...(ctx.body ? { body } : {}) } };
            } catch (error) {
              if (!(error instanceof ExperienceContextError)) throw error;
              throw new APIError("BAD_REQUEST", {
                message:
                  "This link is invalid or has expired. Request a new link from the same website.",
              });
            }
          }),
        },
      ],
    },
  };
}
