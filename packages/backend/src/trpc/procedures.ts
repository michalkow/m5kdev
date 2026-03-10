import { transformer } from "@m5kdev/commons/utils/trpc";
import { initTRPC } from "@trpc/server";
import type { OpenApiMeta } from "trpc-to-openapi";
import { ServerError } from "#utils/errors";
import { runWithPosthogRequestState } from "#utils/posthog";
import type { Context } from "./context";

const errorOptions = {
  layer: "controller" as const,
  layerName: "TRPCController",
};

const t = initTRPC.meta<OpenApiMeta>().context<Context>().create({ transformer });

// Base router and procedure helpers
const baseProcedure = t.procedure.use(({ ctx, next }) =>
  runWithPosthogRequestState({ disableCapture: Boolean(ctx.session?.impersonatedBy) }, () => next())
);

export const publicProcedure = baseProcedure;

export const procedure = baseProcedure.use(({ ctx: { user, session }, next }) => {
  if (!user || !session) {
    throw new ServerError({ code: "UNAUTHORIZED", ...errorOptions }).toTRPC();
  }

  return next({ ctx: { user, session } });
});

export const adminProcedure = baseProcedure.use(({ ctx: { user, session }, next }) => {
  if (!user || !session) {
    throw new ServerError({ code: "UNAUTHORIZED", ...errorOptions }).toTRPC();
  }

  if (user.role !== "admin") {
    throw new ServerError({ code: "FORBIDDEN", ...errorOptions }).toTRPC();
  }

  return next({ ctx: { user, session } });
});

export const mergeRouters = t.mergeRouters;
export const router = t.router;
