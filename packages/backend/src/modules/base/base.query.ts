import type { TRPC_ERROR_CODE_KEY } from "@trpc/server";
import { ok } from "neverthrow";
import type { z } from "zod";
import type { ServerError } from "../../utils/errors";
import type { ServerResult, ServerResultAsync } from "./base.dto";

export type RepositoryQuery<TInput, TOutput> = (input: TInput) => ServerResultAsync<TOutput>;

export type RepositoryQueryResultLike<T> = T | ServerResult<T> | Promise<T | ServerResult<T>>;

export interface RepositoryQueryBuilder<TInput, TExpectedOutput = void> {
  input<TSchema extends z.ZodType>(
    schema: TSchema,
    validate?: boolean
  ): RepositoryQueryBuilder<z.infer<TSchema>, TExpectedOutput>;

  output<TSchema extends z.ZodType>(
    schema: TSchema,
    validate?: boolean
  ): RepositoryQueryBuilder<TInput, z.infer<TSchema>>;

  // biome-ignore lint/suspicious/noConfusingVoidType: void is used as a sentinel for "no output schema declared"
  handle: [TExpectedOutput] extends [void]
    ? <TOutput>(
        handler: (input: TInput) => RepositoryQueryResultLike<TOutput>
      ) => RepositoryQuery<TInput, TOutput>
    : (
        handler: (input: TInput) => RepositoryQueryResultLike<TExpectedOutput>
      ) => RepositoryQuery<TInput, TExpectedOutput>;
}

type QueryBuilderHost = {
  error(
    code: TRPC_ERROR_CODE_KEY,
    message?: string,
    options?: { cause?: unknown; clientMessage?: string; log?: boolean }
  ): ServerResult<never>;
  throwableAsync<T>(fn: () => ServerResultAsync<T>): ServerResultAsync<T>;
  handleUnknownError(error: unknown): ServerError;
};

type QueryBuilderConfig = {
  name: string;
  inputSchema?: z.ZodType;
  outputSchema?: z.ZodType;
};

function isServerResult<T>(value: unknown): value is ServerResult<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "isErr" in value &&
    typeof (value as { isErr: unknown }).isErr === "function" &&
    "isOk" in value &&
    typeof (value as { isOk: unknown }).isOk === "function"
  );
}

async function normalizeQueryResult<T>(
  result: RepositoryQueryResultLike<T>
): Promise<ServerResult<T>> {
  const resolved = await result;
  return isServerResult<T>(resolved) ? resolved : ok(resolved);
}

function createQueryHandler<TInput, TOutput>(
  host: QueryBuilderHost,
  config: QueryBuilderConfig,
  handler: (input: TInput) => RepositoryQueryResultLike<TOutput>
): RepositoryQuery<TInput, TOutput> {
  return async (input) =>
    host.throwableAsync(async () => {
      let currentInput: unknown = input;

      if (config.inputSchema) {
        const parsed = config.inputSchema.safeParse(currentInput);
        if (!parsed.success) {
          return host.error("BAD_REQUEST", parsed.error.message);
        }
        currentInput = parsed.data;
      }

      const handlerResult = await normalizeQueryResult(handler(currentInput as TInput));

      if (handlerResult.isErr()) {
        return handlerResult;
      }

      if (config.outputSchema) {
        const parsed = config.outputSchema.safeParse(handlerResult.value);
        if (!parsed.success) {
          return host.error("INTERNAL_SERVER_ERROR", parsed.error.message);
        }
        return ok(parsed.data as TOutput);
      }

      return handlerResult;
    });
}

export function createRepositoryQueryBuilder<TInput, TExpectedOutput = void>(
  host: QueryBuilderHost,
  config: QueryBuilderConfig
): RepositoryQueryBuilder<TInput, TExpectedOutput> {
  const builder: RepositoryQueryBuilder<TInput, TExpectedOutput> = {
    input(schema, validate) {
      return createRepositoryQueryBuilder(host, {
        ...config,
        inputSchema: validate ? schema : config.inputSchema,
      });
    },
    output(schema, validate) {
      return createRepositoryQueryBuilder(host, {
        ...config,
        outputSchema: validate ? schema : config.outputSchema,
      });
    },
    // biome-ignore lint/suspicious/noExplicitAny: conditional handle type requires untyped implementation
    handle(handler: any) {
      return createQueryHandler(host, config, handler);
    },
  } as RepositoryQueryBuilder<TInput, TExpectedOutput>;

  return builder;
}
