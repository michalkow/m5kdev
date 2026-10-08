import type { IncomingMessage } from "node:http";
import { transformer } from "@m5kdev/commons/utils/trpc";
import {
  initTRPC,
  type TRPCError,
  type TRPCProcedureBuilder,
  type TRPCUnsetMarker,
} from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { fromNodeHeaders } from "better-auth/node";
import type { Result } from "neverthrow";
import { z } from "zod";
import {
  type ActorScope,
  type AdminActor,
  type AuthenticatedActor,
  createActorFromContext,
  type MembershipLookup,
  type OrganizationActor,
  resolveOrganizationActor,
  type TeamActor,
  takeOrganizationId,
  type UserActor,
  validateActor,
} from "../base/base.actor";
import type { BetterAuth, Session, User } from "../modules/auth/auth.lib";
import { captureServerError, reportError, ServerError } from "./errors";
import { logger } from "./logger";
import {
  actorTelemetryFromRequestContext,
  attachTrpcPathToRequest,
  getActorTelemetrySpanAttributes,
  runWithActorTelemetry,
  serializeSpanValue,
  withSpan,
} from "./telemetry";

export type RequestContext = {
  /** Absent for cookieless callers (in-process MCP calls); API keys get a session without an active Organization. */
  session?: Session | null;
  user: User | null;
  actor: UserActor | null;
  /** Express request; used to label the HTTP root span with the tRPC procedure. */
  req?: IncomingMessage;
  /** Better Auth OAuth client id; set by the MCP adapter for in-process calls, absent otherwise. */
  oauthClientId?: string;
};

export type Context = {
  session: Session;
  user: User;
  actor: UserActor;
};

/** `session` is null for cookieless callers that name the Organization with `organizationId`. */
export type OrganizationContext = {
  session?: Session | null;
  user: User;
  actor: OrganizationActor;
};

export type TeamContext = {
  session: Session;
  user: User;
  actor: TeamActor;
};

export type AdminContext = {
  /** Absent for cookieless callers (in-process MCP calls). */
  session?: Session | null;
  user: User;
  actor: AdminActor;
};

/** Cookieless User context; a session is not required. */
export type UserContext = {
  /** Absent for cookieless callers (in-process MCP calls). */
  session?: Session | null;
  user: User;
  actor: UserActor;
};

export interface TRPCProcedureMeta {
  /** Stamped by `privateProcedure` / `userProcedure` / `organizationProcedure` / `adminProcedure`. */
  actorScope?: Exclude<ActorScope, "team">;
  /** Opts the procedure into the MCP catalog; both fields are required. */
  mcp?: {
    /** Flat tool name; collisions fail at boot. */
    name: string;
    /** Instruction-style copy for MCP clients, not OpenAPI. */
    description: string;
  };
}

const t = initTRPC.context<RequestContext>().meta<TRPCProcedureMeta>().create({ transformer });
const baseProcedure = t.procedure.use(async ({ path, type, ctx, input, next }) => {
  attachTrpcPathToRequest(ctx.req, path);
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
const privateProcedure = baseProcedure.meta({ actorScope: "user" }).use(({ ctx, next }) => {
  return next({ ctx: verifyProtectedProcedureContext(ctx) });
});
const userProcedure = baseProcedure.meta({ actorScope: "user" }).use(({ ctx, next }) => {
  return next({ ctx: verifyUserProcedureContext(ctx) });
});
const adminProcedure = baseProcedure.meta({ actorScope: "admin" }).use(({ ctx, next }) => {
  return next({ ctx: verifyAdminProcedureContext(ctx) });
});

const organizationIdInputSchema = z
  .object({ organizationId: z.string().min(1).optional() })
  .optional();

function createOrganizationProcedure(
  memberships: MembershipLookup | undefined
): TRPCProcedureBuilder<
  RequestContext,
  TRPCProcedureMeta,
  OrganizationContext,
  z.input<typeof organizationIdInputSchema>,
  z.output<typeof organizationIdInputSchema>,
  TRPCUnsetMarker,
  TRPCUnsetMarker,
  false
> {
  return baseProcedure
    .meta({ actorScope: "organization" })
    .input(organizationIdInputSchema)
    .use(async ({ ctx, input, next }) => {
      const organizationCtx = await resolveOrganizationProcedureContext({
        ctx,
        organizationId: input?.organizationId,
        memberships,
      });
      return next({ ctx: organizationCtx, input: undefined });
    })
    .use(({ getRawInput, next }) =>
      // Domain parsers (e.g. `z.record`) must not see `organizationId`.
      next({
        getRawInput: async () => {
          const rawInput = await getRawInput();
          const named = takeOrganizationId(rawInput);
          return named.isOk() ? named.value.input : rawInput;
        },
      })
    );
}

export type TRPCMethods = {
  router: typeof t.router;
  createCallerFactory: typeof t.createCallerFactory;
  baseProcedure: typeof baseProcedure;
  publicProcedure: typeof publicProcedure;
  privateProcedure: typeof privateProcedure;
  userProcedure: typeof userProcedure;
  organizationProcedure: ReturnType<typeof createOrganizationProcedure>;
  adminProcedure: typeof adminProcedure;
};

export function createRequestContext() {
  return async function createContext({
    req,
  }: CreateExpressContextOptions): Promise<RequestContext> {
    return {
      session: null,
      user: null,
      actor: null,
      req,
    };
  };
}

export function createTRPCMethods({
  memberships,
}: {
  /** Live Membership lookup for `organizationProcedure` (Auth's organization repository). */
  memberships?: MembershipLookup;
} = {}): TRPCMethods {
  return {
    router: t.router,
    createCallerFactory: t.createCallerFactory,
    baseProcedure,
    publicProcedure,
    privateProcedure,
    userProcedure,
    organizationProcedure: createOrganizationProcedure(memberships),
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
      req,
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

/**
 * Names the Organization with input `organizationId`, else the session active Organization
 * (both rebuilt from a live Membership), else keeps an OrganizationActor already on the call.
 * A session is not required.
 */
async function resolveOrganizationProcedureContext({
  ctx,
  organizationId,
  memberships,
}: {
  ctx: RequestContext;
  organizationId: string | undefined;
  memberships: MembershipLookup | undefined;
}): Promise<OrganizationContext> {
  if (!ctx.user) {
    throw new ServerError({
      code: "UNAUTHORIZED",
      layer: "controller",
      layerName: "TRPCController",
    }).toTRPC();
  }
  const actor = await resolveOrganizationActor({
    user: { userId: ctx.user.id, userRole: ctx.user.role ?? "user" },
    organizationId: organizationId ?? ctx.session?.activeOrganizationId,
    actor: ctx.actor,
    memberships,
  });
  if (actor.isErr()) throw actor.error.toTRPC();
  return { session: ctx.session ?? null, user: ctx.user, actor: actor.value };
}

/**
 * Names the User without requiring a session, so cookieless callers (in-process
 * MCP calls) can invoke user-scoped procedures. An extra `organizationId` in
 * the input never selects an OrganizationActor here.
 */
export function verifyUserProcedureContext(ctx: RequestContext): UserContext {
  if (!ctx.user) {
    throw new ServerError({
      code: "UNAUTHORIZED",
      layer: "controller",
      layerName: "TRPCController",
    }).toTRPC();
  }
  const actor: UserActor =
    ctx.actor && validateActor(ctx.actor, "user")
      ? ctx.actor
      : {
          userId: ctx.user.id,
          userRole: ctx.user.role ?? "user",
          organizationId: null,
          organizationRole: null,
          memberId: null,
          teamId: null,
          teamRole: null,
        };
  return { session: ctx.session ?? null, user: ctx.user, actor };
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
  if (!ctx.user) {
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
  const actor: AdminActor =
    ctx.actor && validateActor(ctx.actor, "admin")
      ? { ...ctx.actor, userRole: "admin" as const }
      : {
          userId: ctx.user.id,
          userRole: "admin" as const,
          organizationId: null,
          organizationRole: null,
          memberId: null,
          teamId: null,
          teamRole: null,
        };
  return { session: ctx.session ?? null, user: ctx.user, actor };
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
