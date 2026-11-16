import type { BetterAuthPlugin } from "better-auth";
import { APIError, addOAuthServerContext, createAuthMiddleware } from "better-auth/api";
import { ExperienceContextError, type ExperienceRegistry } from "../../experience";

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

export function experienceAuthPlugin(registry: ExperienceRegistry): BetterAuthPlugin {
  return {
    id: "m5kdev-experience",
    hooks: {
      before: [
        {
          matcher: () => true,
          handler: createAuthMiddleware(async (ctx) => {
            try {
              const experience = resolveAuthExperience(registry, ctx.request, ctx.headers);
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
              if (ctx.body) return { context: { body } };
              return;
            } catch (error) {
              if (!(error instanceof ExperienceContextError)) throw error;
              throw new APIError("BAD_REQUEST", { message: error.message });
            }
          }),
        },
      ],
    },
  };
}
