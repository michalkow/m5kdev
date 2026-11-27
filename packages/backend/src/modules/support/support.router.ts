import { type RequestHandler, Router } from "express";
import { z } from "zod";
import { createActorFromContext } from "../../base/base.actor";
import type { ServerResultAsync } from "../../base/base.dto";
import type { ServiceProcedureAuthContext } from "../../base/base.service";
import type { AuthMiddleware, AuthRequest } from "../auth/auth.middleware";
import { supportSchemas } from "./support.dto";
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

  const paths: Record<string, Record<string, unknown>> = {};
  const jsonSchema = (schema: z.ZodType) =>
    z.toJSONSchema(schema, {
      unrepresentable: "any",
      override: ({ zodSchema, jsonSchema }) => {
        if (zodSchema._zod.def.type === "date")
          Object.assign(jsonSchema, { type: "string", format: "date-time" });
      },
    });
  const register = <I, O>(
    method: "get" | "post",
    path: string,
    operationId: string,
    inputSchema: z.ZodType<I>,
    outputSchema: z.ZodType<O>,
    input: (request: AuthRequest) => unknown,
    handle: (value: I, ctx: ServiceProcedureAuthContext<"user">) => ServerResultAsync<O>
  ) => {
    router[method](path, endpoint(inputSchema, input, handle));
    const inputJson = jsonSchema(inputSchema);
    const properties = { ...inputJson.properties };
    const required = (inputJson.required ?? []).filter((key) => !path.includes(":id") || key !== "id");
    if(path.includes(":id"))delete properties.id;
    const parameters: Record<string, unknown>[] = path.includes(":id")
      ? [{ name: "id", in: "path", required: true, schema: { type: "string" } }]
      : [];
    if (method === "get")
      for (const [name, schema] of Object.entries(properties))
        parameters.push({ name, in: "query", required: required.includes(name), schema });
    const wirePath = path.replace(":id", "{id}");
    paths[wirePath] ??= {};
    paths[wirePath][method] = {
      operationId,
      parameters,
      ...(method === "post"
        ? {
            requestBody: {
              required: true,
              content: { "application/json": { schema: { ...inputJson, properties, required } } },
            },
          }
        : {}),
      responses: {
        "200": {
          description: "Successful operation",
          content: { "application/json": { schema: jsonSchema(outputSchema) } },
        },
        "400": { description: "Invalid request or cursor" },
        "401": { description: "Session missing, expired or revoked" },
        "403": { description: "Operation forbidden" },
        "409": { description: "Conflicting revision or idempotency key" },
        "429": { description: "Rate limit exceeded" },
      },
    };
  };
  register(
    "post",
    "/cases",
    "createCase",
    supportSchemas.input.createCase,
    supportSchemas.output.case,
    (req) => req.body,
    (input, ctx) => service.createCase(input, ctx)
  );
  register(
    "get",
    "/cases",
    "listCases",
    supportSchemas.input.list,
    supportSchemas.output.list,
    (req) => ({
      ...req.query,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
      active: req.query.active === "true",
      assignedUserId: req.query.assignedUserId === "null" ? null : req.query.assignedUserId,
    }),
    (input, ctx) => service.listCases(input, ctx)
  );
  register(
    "get",
    "/cases/:id",
    "getCase",
    supportSchemas.input.history,
    supportSchemas.output.transcript,
    (req) => ({
      ...req.params,
      beforeSequence:
        req.query.beforeSequence === undefined ? undefined : Number(req.query.beforeSequence),
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    }),
    (input, ctx) => service.getCase(input, ctx)
  );
  register(
    "post",
    "/cases/:id/messages",
    "sendMessage",
    supportSchemas.input.send,
    supportSchemas.output.message,
    (req) => ({ ...req.body, id: req.params.id }),
    (input, ctx) => service.sendMessage(input, ctx)
  );
  register(
    "get",
    "/cases/:id/changes",
    "sync",
    supportSchemas.input.sync,
    supportSchemas.output.sync,
    (req) => ({
      id: req.params.id,
      cursor: req.query.cursor,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    }),
    (input, ctx) => service.sync(input, ctx)
  );
  register(
    "post",
    "/cases/:id/read",
    "markRead",
    supportSchemas.input.markRead,
    supportSchemas.output.markRead,
    (req) => ({ ...req.body, id: req.params.id }),
    (input, ctx) => service.markRead(input, ctx)
  );
  register(
    "post",
    "/cases/:id/state",
    "updateCase",
    supportSchemas.input.updateCase,
    supportSchemas.output.case,
    (req) => ({ ...req.body, id: req.params.id }),
    (input, ctx) => service.updateCase(input, ctx)
  );
  register(
    "get",
    "/catalog",
    "getCatalog",
    z.object({}),
    supportSchemas.output.catalog,
    () => ({}),
    (input, ctx) => service.getCatalog(input, ctx)
  );
  register(
    "post",
    "/catalog",
    "saveCatalog",
    supportSchemas.input.catalog,
    supportSchemas.output.catalog,
    (req) => req.body,
    (input, ctx) => service.saveCatalog(input, ctx)
  );
  register(
    "post",
    "/cases/:id/tags",
    "setTags",
    supportSchemas.input.setTags,
    supportSchemas.output.case,
    (req) => ({ ...req.body, id: req.params.id }),
    (input, ctx) => service.setTags(input, ctx)
  );
  register(
    "post",
    "/cases/:id/uploads",
    "initiateAttachment",
    supportSchemas.input.upload,
    supportSchemas.output.upload,
    (req) => ({ ...req.body, id: req.params.id }),
    (input, ctx) => service.initiateAttachment(input, ctx)
  );
  register(
    "post",
    "/cases/:id/download",
    "downloadAttachment",
    supportSchemas.input.download,
    supportSchemas.output.download,
    (req) => ({ ...req.body, id: req.params.id }),
    (input, ctx) => service.downloadAttachment(input, ctx)
  );
  register(
    "post",
    "/cases/:id/redact",
    "redactMessage",
    supportSchemas.input.redact,
    supportSchemas.output.redaction,
    (req) => ({ ...req.body, id: req.params.id }),
    (input, ctx) => service.redactMessage(input, ctx)
  );
  register(
    "get",
    "/settings",
    "getSettings",
    z.object({}),
    supportSchemas.output.settings,
    () => ({}),
    (input, ctx) => service.getSettings(input, ctx)
  );
  register(
    "post",
    "/settings",
    "saveSettings",
    supportSchemas.input.saveSettings,
    supportSchemas.output.settings,
    (req) => req.body,
    (input, ctx) => service.saveSettings(input, ctx)
  );
  register(
    "post",
    "/working-locale",
    "setWorkingLocale",
    supportSchemas.input.workingLocale,
    supportSchemas.output.locale,
    (req) => req.body,
    (input, ctx) => service.setWorkingLocale(input, ctx)
  );
  register(
    "post",
    "/cases/:id/language",
    "setLanguage",
    supportSchemas.input.language,
    supportSchemas.output.case,
    (req) => ({ ...req.body, id: req.params.id }),
    (input, ctx) => service.setLanguage(input, ctx)
  );
  register(
    "post",
    "/cases/:id/translate",
    "requestTranslation",
    supportSchemas.input.translate,
    supportSchemas.output.work,
    (req) => ({ ...req.body, id: req.params.id }),
    (input, ctx) => service.requestTranslation(input, ctx)
  );
  register(
    "post",
    "/cases/:id/publication",
    "controlMessage",
    supportSchemas.input.controlMessage,
    supportSchemas.output.message,
    (req) => ({ ...req.body, id: req.params.id }),
    (input, ctx) => service.controlMessage(input, ctx)
  );
  router.get("/openapi.json", (_req, res) =>
    res.json({
      openapi: "3.1.0",
      info: { title: "Support API", version: "1.0.0" },
      servers: [{ url: "/api/v1/support" }],
      security: [{ bearerSession: [] }, { cookieSession: [] }],
      components: {
        securitySchemes: {
          bearerSession: { type: "http", scheme: "bearer" },
          cookieSession: { type: "apiKey", in: "cookie", name: "better-auth.session_token" },
        },
      },
      paths,
    })
  );
  return router;
}
