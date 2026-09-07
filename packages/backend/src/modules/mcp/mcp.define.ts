import { type ZodType, z } from "zod";
import type { OrganizationActor, UserActor } from "../../base/base.actor";
import type {
  McpOrganizationCallDefinition,
  McpUserCallDefinition,
  McpUserCallRequest,
} from "./mcp.types";

export interface McpOrganizationCallBuilder<TInput = unknown> {
  readonly scope: "organization";
  readonly description: string;
  inputSchema: ZodType<TInput>;
  input<TNext>(schema: ZodType<TNext>): McpOrganizationCallBuilder<TNext>;
  handle(
    handler: (input: TInput, actor: OrganizationActor) => unknown
  ): McpOrganizationCallDefinition<TInput>;
}

export interface McpUserCallBuilder<TInput = unknown> {
  readonly scope: "user";
  readonly description: string;
  inputSchema: ZodType<TInput>;
  input<TNext>(schema: ZodType<TNext>): McpUserCallBuilder<TNext>;
  handle(
    handler: (input: TInput, actor: UserActor, request: McpUserCallRequest) => unknown
  ): McpUserCallDefinition<TInput>;
}

export function defineMcpCall(): {
  description(text: string): McpOrganizationCallBuilder;
} {
  return {
    description(text: string): McpOrganizationCallBuilder {
      const builder: McpOrganizationCallBuilder = {
        scope: "organization",
        description: text,
        inputSchema: z.object({}) as ZodType,
        input<TNext>(schema: ZodType<TNext>): McpOrganizationCallBuilder<TNext> {
          builder.inputSchema = schema as unknown as ZodType;
          return builder as unknown as McpOrganizationCallBuilder<TNext>;
        },
        handle(handler) {
          return {
            scope: "organization",
            description: builder.description,
            inputSchema: builder.inputSchema,
            handle: handler,
          };
        },
      };
      return builder;
    },
  };
}

export function defineUserMcpCall(): {
  description(text: string): McpUserCallBuilder;
} {
  return {
    description(text: string): McpUserCallBuilder {
      const builder: McpUserCallBuilder = {
        scope: "user",
        description: text,
        inputSchema: z.object({}) as ZodType,
        input<TNext>(schema: ZodType<TNext>): McpUserCallBuilder<TNext> {
          builder.inputSchema = schema as unknown as ZodType;
          return builder as unknown as McpUserCallBuilder<TNext>;
        },
        handle(handler) {
          return {
            scope: "user",
            description: builder.description,
            inputSchema: builder.inputSchema,
            handle: handler,
          };
        },
      };
      return builder;
    },
  };
}
