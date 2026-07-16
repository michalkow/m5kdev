import { transformer } from "@m5kdev/commons/utils/trpc";
import { initTRPC, type TRPCError } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { fromNodeHeaders } from "better-auth/node";
import type { Result } from "neverthrow";
import type { BetterAuth, Session, User } from "../modules/auth/auth.lib";
import {
  type ActorScope,
  type AdminActor,
  type AuthenticatedActor,
  createActorFromContext,
  type OrganizationActor,
  type TeamActor,
  type UserActor,
  validateActor,
} from "../modules/base/base.actor";
import { captureServerError, reportError, ServerError } from "./errors";
import { logger } from "./logger";
import { serializeSpanValue, withSpan, actorTelemetryFromRequestContext, runWithActorTelemetry, getActorTelemetrySpanAttributes } from "./telemetry";

export type RequestContext = {
  session: Session | null;
  user: User | null;
  actor: UserActor | null;
};

export type Context = {
  session: Session;
  user: User;
  actor: UserActor;
};

export type OrganizationContext = {
  session: Session;
  user: User;
  actor: OrganizationActor;
};

export type TeamContext = {
  session: Session;
  user: User;
  actor: TeamActor;
};

export type AdminContext = {
  session: Session;
  user: User;
  actor: AdminActor;
};

const t = initTRPC.context<RequestContext>().create({ transformer });
const baseProcedure = t.procedure.use(async ({ path, type, ctx, input, next }) => {
  return runWithActorTelemetry(actorTelemetryFromRequestContext(ctx), () =>
    withSpan(
      {
        name: `trpc.${path ?? "unknown"}`,
        attributes: {
          "trpc.type": type,
          "trpc.path": path ?? "unknown",
          input: serializeSpanValue(input),
          ...getActorTelemetrySpanAttributes(),
        },
      },
      () => next()
    )
  );
});
const publicProcedure = baseProcedure;
const privateProcedure = baseProcedure.use(({ ctx, next }) => {
  return next({ ctx: verifyProtectedProcedureContext(ctx) });
});
const organizationProcedure = privateProcedure.use(({ ctx, next }) => {
  return next({ ctx: verifyOrganizationProcedureContext(ctx) });
});
const adminProcedure = baseProcedure.use(({ ctx, next }) => {
  return next({ ctx: verifyAdminProcedureContext(ctx) });
});

export type TRPCMethods = {
  router: typeof t.router;
  baseProcedure: typeof baseProcedure;
  publicProcedure: typeof publicProcedure;
  privateProcedure: typeof privateProcedure;
  organizationProcedure: typeof organizationProcedure;
  adminProcedure: typeof adminProcedure;
};

export function createRequestContext() {
  return async function createContext(): Promise<RequestContext> {
    return {
      session: null,
      user: null,
      actor: null,
    };
  };
}

export function createTRPCMethods() {
  return {
    router: t.router,
    baseProcedure,
    publicProcedure,
    privateProcedure,
    organizationProcedure,
    adminProcedure,
  };
}

export function createAuthContext(auth: BetterAuth) {
  return async function createContext({
    req,
  }: CreateExpressContextOptions): Promise<RequestContext> {
    const data = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    const user = (data?.user as User) || null;
    const session = (data?.session as Session) || null;
    const actor = user && session ? createActorFromContext({ user, session }, "user") : null;

    return {
      session,
      user,
      actor,
    };
  };
}

export async function handleAsyncTRPCResult<T>(result: Promise<Result<T, ServerError>>) {
  return handleTRPCResult(await result);
}

export function handleTRPCResult<T>(result: Result<T, ServerError>) {
  if (result.isErr()) {
    // no-op when the error was already captured at creation (Base helpers);
    // fallback capture for ServerErrors constructed outside them
    captureServerError(result.error);
    throw result.error.toTRPC();
  }
  return result.value;
}

/**
 * tRPC middleware onError hook. Errors that went through our Result flow were
 * already captured at creation — echo a compact warn line with transport
 * context. Anything else never touched our error path, so capture it fully here.
 */
export function handleTRPCBoundaryError({
  error,
  type,
  path,
  input,
}: {
  error: TRPCError;
  type: string;
  path?: string;
  input?: unknown;
}) {
  const cause = error.cause;
  if (cause instanceof ServerError) {
    captureServerError(cause); // no-op when already captured
    logger.warn(
      {
        path,
        type,
        code: error.code,
        origin: cause.origin,
        sentryEventId: cause.sentryEventId,
      },
      error.message
    );
  } else {
    const statusCode = getHTTPStatusCodeFromError(error);
    if (statusCode >= 500) reportError(error);
    logger[statusCode >= 500 ? "error" : "warn"]({ err: error, path, type }, error.message);
  }
  logger.debug({ path, type, input }, "trpc.request.input");
}

export function verifyProtectedProcedureContext(ctx: RequestContext): Context {
  if (!ctx.user || !ctx.session || !ctx.actor) {
    throw new ServerError({
      code: "UNAUTHORIZED",
      layer: "controller",
      layerName: "TRPCController",
    }).toTRPC();
  }
  return ctx as Context;
}

export function verifyOrganizationProcedureContext(ctx: Context): OrganizationContext {
  if (!ctx.user || !ctx.session) {
    throw new ServerError({
      code: "UNAUTHORIZED",
      layer: "controller",
      layerName: "TRPCController",
    }).toTRPC();
  }
  try {
    const actor = createActorFromContext({ user: ctx.user, session: ctx.session }, "organization");
    return { ...ctx, actor };
  } catch (e) {
    if (e instanceof ServerError) throw e.toTRPC();
    throw e;
  }
}

export function verifyTeamProcedureContext(ctx: Context): TeamContext {
  if (!ctx.user || !ctx.session) {
    throw new ServerError({
      code: "UNAUTHORIZED",
      layer: "controller",
      layerName: "TRPCController",
    }).toTRPC();
  }
  try {
    const actor = createActorFromContext({ user: ctx.user, session: ctx.session }, "team");
    return { ...ctx, actor };
  } catch (e) {
    if (e instanceof ServerError) throw e.toTRPC();
    throw e;
  }
}

export function verifyAdminProcedureContext(ctx: RequestContext): AdminContext {
  if (!ctx.user || !ctx.session) {
    throw new ServerError({
      code: "UNAUTHORIZED",
      layer: "controller",
      layerName: "TRPCController",
    }).toTRPC();
  }

  if (ctx.user.role !== "admin") {
    throw new ServerError({
      code: "FORBIDDEN",
      layer: "controller",
      layerName: "TRPCController",
    }).toTRPC();
  }
  if (!ctx.actor) {
    throw new ServerError({
      code: "UNAUTHORIZED",
      layer: "controller",
      layerName: "TRPCController",
    }).toTRPC();
  }
  return ctx as AdminContext;
}

export function requireRequestUser(ctx: RequestContext): User {
  return verifyProtectedProcedureContext(ctx).user;
}

export function requireRequestActor(ctx: RequestContext): UserActor;
export function requireRequestActor(ctx: RequestContext, scope: "organization"): OrganizationActor;
export function requireRequestActor(ctx: RequestContext, scope: "team"): TeamActor;
export function requireRequestActor(
  ctx: RequestContext,
  scope: ActorScope = "user"
): AuthenticatedActor {
  const verified = verifyProtectedProcedureContext(ctx);

  if (scope === "user") {
    if (!validateActor(verified.actor, "user")) {
      throw new ServerError({
        code: "FORBIDDEN",
        layer: "controller",
        layerName: "TRPCController",
      }).toTRPC();
    }
    return verified.actor;
  }

  try {
    if (scope === "organization") {
      const actor = createActorFromContext(
        { user: verified.user, session: verified.session },
        "organization"
      );
      if (!validateActor(actor, "organization")) {
        throw new ServerError({
          code: "FORBIDDEN",
          layer: "controller",
          layerName: "TRPCController",
        }).toTRPC();
      }
      return actor;
    }

    const actor = createActorFromContext(
      { user: verified.user, session: verified.session },
      "team"
    );
    if (!validateActor(actor, "team")) {
      throw new ServerError({
        code: "FORBIDDEN",
        layer: "controller",
        layerName: "TRPCController",
      }).toTRPC();
    }
    return actor;
  } catch (e) {
    if (e instanceof ServerError) throw e.toTRPC();
    throw e;
  }
}
