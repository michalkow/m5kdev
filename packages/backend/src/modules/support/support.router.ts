import {
  supportCaseIdSchema,
  supportCreateCaseSchema,
  supportListSchema,
  supportSendMessageSchema,
} from "@m5kdev/commons/modules/support/support.schema";
import { type RequestHandler, Router } from "express";
import type { z } from "zod";
import { createActorFromContext } from "../../base/base.actor";
import type { ServerResultAsync } from "../../base/base.dto";
import type { ServiceProcedureAuthContext } from "../../base/base.service";
import type { AuthMiddleware, AuthRequest } from "../auth/auth.middleware";
import type { SupportService } from "./support.service";

export function createSupportRouter(service: SupportService, auth: AuthMiddleware): Router {
  const router = Router();
  router.use(auth);
  const endpoint =
    <I, O>(
      schema: z.ZodType<I>,
      input: (req: AuthRequest) => unknown,
      handle: (value: I, ctx: ServiceProcedureAuthContext<"user">) => ServerResultAsync<O>
    ): RequestHandler =>
    async (req, res) => {
      const request = req as AuthRequest;
      const { user, session } = request;
      if (!user || !session) {
        res.status(401).json({ code: "UNAUTHORIZED" });
        return;
      }
      const parsed = schema.safeParse(input(request));
      if (!parsed.success) {
        res.status(400).json({
          code: "BAD_REQUEST",
          message: "Invalid support request",
          issues: parsed.error.issues,
        });
        return;
      }
      const result = await handle(parsed.data, {
        user,
        session,
        actor: createActorFromContext({ user, session }, "user"),
      });
      res.set("Cache-Control", "private, no-store");
      if (result.isErr()) {
        res.status(result.error.getHTTPStatusCode()).json({
          code: result.error.code,
          message: result.error.is5xxError()
            ? "Support is temporarily unavailable"
            : result.error.message,
        });
      } else res.json(result.value);
    };
  router.post(
    "/cases",
    endpoint(
      supportCreateCaseSchema,
      (req) => req.body,
      (input, ctx) => service.createCase(input, ctx)
    )
  );
  router.get(
    "/cases",
    endpoint(
      supportListSchema,
      (req) => ({ limit: req.query.limit === undefined ? undefined : Number(req.query.limit) }),
      (input, ctx) => service.listCases(input, ctx)
    )
  );
  router.get(
    "/cases/:id",
    endpoint(
      supportCaseIdSchema,
      (req) => req.params,
      (input, ctx) => service.getCase(input, ctx)
    )
  );
  router.post(
    "/cases/:id/messages",
    endpoint(
      supportSendMessageSchema,
      (req) => ({ ...req.body, id: req.params.id }),
      (input, ctx) => service.sendMessage(input, ctx)
    )
  );
  return router;
}
