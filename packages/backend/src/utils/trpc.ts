import type { transformer } from "@m5kdev/commons/utils/trpc";
import type { TRPCRootObject } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { fromNodeHeaders } from "better-auth/node";
import type { Result } from "neverthrow";
import type { BetterAuth, Session, User } from "../modules/auth/auth.lib";
import {
  createActorFromContext,
  type OrganizationActor,
  type TeamActor,
  type UserActor,
} from "../modules/base/base.actor";
import { ServerError } from "./errors";
import { logger } from "./logger";

export type Context = { session: Session; user: User; actor: UserActor };
export type OrganizationContext = { session: Session; user: User; actor: OrganizationActor };
export type TeamContext = { session: Session; user: User; actor: TeamActor };

type TRPCCreate = TRPCRootObject<Context, any, { transformer: typeof transformer }>;

export type TRPCMethods = {
  router: TRPCCreate["router"];
  publicProcedure: TRPCCreate["procedure"];
  privateProcedure: TRPCCreate["procedure"];
  adminProcedure: TRPCCreate["procedure"];
};

export function createAuthContext(auth: BetterAuth) {
  return async function createContext({ req }: CreateExpressContextOptions) {
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

export function verifyProtectedProcedureContext(ctx: Context): Context {
  if (!ctx.user || !ctx.session) {
    throw new ServerError({
      code: "UNAUTHORIZED",
      layer: "controller",
      layerName: "TRPCController",
    }).toTRPC();
  }
  return ctx;
}

export function verifyOrganizationProcedureContext(ctx: Context): OrganizationContext {
  if (!ctx.user || !ctx.session) {
    throw new ServerError({
      code: "UNAUTHORIZED",
      layer: "controller",
      layerName: "TRPCController",
    }).toTRPC();
  }
  const actor = createActorFromContext(ctx, "organization");
  return { ...ctx, actor };
}

export function verifyTeamProcedureContext(ctx: Context): TeamContext {
  if (!ctx.user || !ctx.session) {
    throw new ServerError({
      code: "UNAUTHORIZED",
      layer: "controller",
      layerName: "TRPCController",
    }).toTRPC();
  }
  const actor = createActorFromContext(ctx, "team");
  return { ...ctx, actor };
}

export function verifyAdminProcedureContext(ctx: Context): Context {
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
  return ctx;
}
