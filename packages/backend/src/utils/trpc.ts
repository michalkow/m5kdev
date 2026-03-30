import type { transformer } from "@m5kdev/commons/utils/trpc";
import type { TRPCRootObject } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { fromNodeHeaders } from "better-auth/node";
import type { Result } from "neverthrow";
import type { BetterAuth, Session, User } from "../modules/auth/auth.lib";
import {
  createActorFromContext,
  validateActor,
  type ActorScope,
  type AuthenticatedActor,
  type OrganizationActor,
  type TeamActor,
  type UserActor,
} from "../modules/base/base.actor";
import { ServerError } from "./errors";
import { logger } from "./logger";

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

type TRPCCreate = TRPCRootObject<Context, any, { transformer: typeof transformer }>;

export type TRPCMethods = {
  router: TRPCCreate["router"];
  publicProcedure: TRPCCreate["procedure"];
  privateProcedure: TRPCCreate["procedure"];
  adminProcedure: TRPCCreate["procedure"];
};

export function createAuthContext(auth: BetterAuth) {
  return async function createContext({ req }: CreateExpressContextOptions): Promise<RequestContext> {
    const data = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    const user = (data?.user as User) || null;
    const session = (data?.session as Session) || null;
    const actor =
      user && session ? createActorFromContext({ user, session }, "user") : null;

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
    logger.debug("Is tRPC Error");
    logger.error({
      layer: result.error.layer,
      layerName: result.error.layerName,
      error: result.error.toJSON(),
    });
    throw result.error.toTRPC();
  }
  return result.value;
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

export function verifyAdminProcedureContext(ctx: RequestContext): Context {
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
  return ctx as Context;
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
