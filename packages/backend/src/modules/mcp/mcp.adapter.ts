import type { AnyRouter } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { err, ok } from "neverthrow";
import { z } from "zod";
import type { ActorScope } from "../../base/base.actor";
import type { ServerResultAsync } from "../../base/base.dto";
import { ServerError } from "../../utils/errors";
import type { TRPCMethods, TRPCProcedureMeta } from "../../utils/trpc";
import { mcpToolInputSchema } from "./mcp.protocol";
import type { McpService } from "./mcp.service";
import type { McpInvokeInput } from "./mcp.types";

export interface McpToolBinding {
  name: string;
  description: string;
  actorScope: Exclude<ActorScope, "team">;
  trpcPath: string;
  /** Advertised MCP input shape; org tools require `organizationId`. */
  inputSchema: z.ZodObject<z.ZodRawShape>;
  requiresOrganizationId: boolean;
}

function readProcedureMeta(procedure: unknown): TRPCProcedureMeta | undefined {
  if ((typeof procedure !== "object" && typeof procedure !== "function") || procedure === null) {
    return undefined;
  }
  const def = (procedure as { _def?: unknown })._def;
  if (typeof def !== "object" || def === null) return undefined;
  const meta = (def as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null) return undefined;
  return meta as TRPCProcedureMeta;
}

function readProcedureInputs(procedure: unknown): unknown[] {
  if ((typeof procedure !== "object" && typeof procedure !== "function") || procedure === null) {
    return [];
  }
  const def = (procedure as { _def?: unknown })._def;
  if (typeof def !== "object" || def === null) return [];
  const inputs = (def as { inputs?: unknown }).inputs;
  return Array.isArray(inputs) ? inputs : [];
}

/** Unwraps optional/default wrappers to the Zod object shape, if any. */
function objectShape(parser: unknown): z.ZodRawShape | undefined {
  let current = parser;
  for (;;) {
    if ((typeof current !== "object" && typeof current !== "function") || current === null) {
      return undefined;
    }
    const def = (current as { _def?: unknown })._def;
    if (typeof def !== "object" || def === null) return undefined;
    const record = def as Record<string, unknown>;
    if (record.typeName === "ZodObject" || record.type === "object") {
      const shape = (current as { shape?: unknown }).shape;
      if (typeof shape === "object" && shape !== null) return shape as z.ZodRawShape;
      return undefined;
    }
    if ("innerType" in record) {
      current = record.innerType;
      continue;
    }
    return undefined;
  }
}

/**
 * Walks the built tRPC router for procedures with `meta.mcp`. Tool names are
 * flat; collisions and malformed entries fail at boot.
 */
export function collectMcpTools(router: AnyRouter): McpToolBinding[] {
  const procedures = (router as unknown as { _def?: { procedures?: unknown } })._def?.procedures;
  if (typeof procedures !== "object" || procedures === null) {
    throw new Error("MCP adapter requires a tRPC router with _def.procedures");
  }
  const tools = new Map<string, McpToolBinding>();
  for (const [trpcPath, procedure] of Object.entries(procedures as Record<string, unknown>)) {
    const meta = readProcedureMeta(procedure);
    if (!meta?.mcp) continue;
    const name = meta.mcp.name;
    if (typeof name !== "string" || name.length === 0) {
      throw new Error(`MCP tool at "${trpcPath}" requires a non-empty mcp.name`);
    }
    const description = meta.mcp.description;
    if (typeof description !== "string" || description.length === 0) {
      throw new Error(`MCP tool "${name}" requires a non-empty mcp.description`);
    }
    const actorScope = meta.actorScope;
    if (actorScope !== "user" && actorScope !== "organization" && actorScope !== "admin") {
      throw new Error(
        `MCP tool "${name}" must use a user, organization, or admin procedure (missing actorScope)`
      );
    }
    const existing = tools.get(name);
    if (existing) {
      throw new Error(
        `Duplicate MCP tool name "${name}" (already registered from "${existing.trpcPath}")`
      );
    }
    const domainShape: z.ZodRawShape = {};
    for (const input of readProcedureInputs(procedure)) {
      const shape = objectShape(input);
      if (shape) Object.assign(domainShape, shape);
    }
    const { organizationId: _dropped, ...rest } = domainShape;
    const requiresOrganizationId = actorScope === "organization";
    const inputSchema = mcpToolInputSchema(
      { requiresOrganizationId },
      { inputSchema: z.object(rest) }
    );
    tools.set(name, {
      name,
      description,
      actorScope,
      trpcPath,
      inputSchema,
      requiresOrganizationId,
    });
  }
  return [...tools.values()];
}

async function invokeByPath(
  caller: Record<string, unknown>,
  trpcPath: string,
  args: unknown
): Promise<unknown> {
  let target: unknown = caller;
  for (const segment of trpcPath.split(".")) {
    if ((typeof target !== "object" && typeof target !== "function") || target === null) {
      throw new ServerError({
        code: "NOT_FOUND",
        message: `Unknown MCP tool path "${trpcPath}"`,
      });
    }
    target = (target as Record<string, unknown>)[segment];
  }
  if (typeof target !== "function") {
    throw new ServerError({
      code: "NOT_FOUND",
      message: `Unknown MCP tool path "${trpcPath}"`,
    });
  }
  return (target as (input: unknown) => Promise<unknown>)(args);
}

function toServerError(cause: unknown): ServerError {
  if (cause instanceof ServerError) return cause;
  if (cause instanceof TRPCError) {
    if (cause.cause instanceof ServerError) return cause.cause;
    return new ServerError({ code: cause.code, message: cause.message });
  }
  if (cause instanceof Error) {
    return new ServerError({ code: "INTERNAL_SERVER_ERROR", message: cause.message });
  }
  return new ServerError({ code: "INTERNAL_SERVER_ERROR", message: "MCP tool failed" });
}

export function createMcpToolInvoker(input: {
  router: AnyRouter;
  methods: Pick<TRPCMethods, "createCallerFactory">;
  mcp: McpService;
  tools?: readonly McpToolBinding[];
}): (payload: McpInvokeInput) => ServerResultAsync<unknown> {
  const tools = new Map(
    (input.tools ?? collectMcpTools(input.router)).map((tool) => [tool.name, tool])
  );
  const createCaller = input.methods.createCallerFactory(input.router);
  return async ({
    userId,
    oauthClientId,
    name,
    arguments: args,
  }: McpInvokeInput): ServerResultAsync<unknown> => {
    const tool = tools.get(name);
    if (!tool) {
      return err(new ServerError({ code: "NOT_FOUND", message: `Unknown MCP tool "${name}"` }));
    }
    const userResult = await input.mcp.resolveCallerUser({ userId });
    if (userResult.isErr()) return err(userResult.error);
    if (tool.actorScope === "organization") {
      const organizationId = args.organizationId;
      if (typeof organizationId !== "string" || organizationId.length === 0) {
        return err(new ServerError({ code: "BAD_REQUEST", message: "organizationId is required" }));
      }
      const allowlisted = await input.mcp.checkOrganizationAllowlisted({
        oauthClientId,
        userId,
        organizationId,
      });
      if (allowlisted.isErr()) return err(allowlisted.error);
    }
    const caller = createCaller({
      user: userResult.value,
      session: null,
      actor: null,
      oauthClientId,
    });
    try {
      return ok(await invokeByPath(caller as Record<string, unknown>, tool.trpcPath, args));
    } catch (cause) {
      return err(toServerError(cause));
    }
  };
}
