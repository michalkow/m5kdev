import {
  type createAuthContext,
  verifyProtectedProcedureContext,
} from "@m5kdev/backend/utils/trpc";
import { transformer } from "@m5kdev/commons/utils/trpc";
import { initTRPC } from "@trpc/server";

type Context = Awaited<ReturnType<ReturnType<typeof createAuthContext>>>;

const t = initTRPC.context<Context>().create({ transformer });

export const publicProcedure = t.procedure;

export const procedure = t.procedure.use(({ ctx, next }) => {
  verifyProtectedProcedureContext(ctx);
  return next({ ctx });
});

export const router = t.router;
export const mergeRouters = t.mergeRouters;

export const trpcObject = {
  router,
  privateProcedure: procedure,
  adminProcedure: procedure,
  publicProcedure,
};
