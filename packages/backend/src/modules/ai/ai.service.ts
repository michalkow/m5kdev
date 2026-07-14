import {
  OPENAI_TEXT_EMBEDDING_3_SMALL,
  STRUCTURED_OUTPUT_FAST,
} from "@m5kdev/commons/modules/ai/ai.constants";
import { arrayToPseudoXML } from "@m5kdev/commons/modules/ai/ai.utils";
import type { Mastra } from "@mastra/core";
import { RequestContext } from "@mastra/core/request-context";
import type { FullOutput, MastraModelOutput } from "@mastra/core/stream";
import { MDocument } from "@mastra/rag";
import type { OpenRouterProvider } from "@openrouter/ai-sdk-provider";
import {
  embed,
  embedMany,
  generateText,
  type ModelMessage,
  NoObjectGeneratedError,
  Output,
  RetryError,
} from "ai";
import { jsonrepair } from "jsonrepair";
import { err, ok } from "neverthrow";
import type Replicate from "replicate";
import { type ZodType, z } from "zod";
import type { RequiredServiceActor } from "../base/base.actor";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseService } from "../base/base.service";
import { extractObjectPrompt, repairJsonPrompt, repairZodPrompt } from "./ai.prompts";
import type { AiUsageRepository, AiUsageRow, AiVectorRepository } from "./ai.repository";
import type { IdeogramV3GenerateInput, IdeogramV3GenerateOutput } from "./ideogram/ideogram.dto";
import type { IdeogramService } from "./ideogram/ideogram.service";

type MastraAgent = ReturnType<Mastra["getAgent"]>;
type MastraAgentGenerateOptions = Parameters<MastraAgent["generate"]>[1];
type MastraAgentObjectGeneration<T extends ZodType> = MastraAgentGenerateOptions & {
  schema: T;
  prompt?: string;
  messages?: MessageListInput;
  extractor?: Omit<AIServiceExtractObjectParams<T>, "text" | "schema">;
};
type MessageListInput = { role: "user" | "assistant" | "system"; content: string }[];
type GenerateTextParams = Parameters<typeof generateText>[0];
type GenerateTextInput =
  | { prompt: string | ModelMessage[]; messages?: never }
  | { messages: ModelMessage[]; prompt?: never };
type AIServiceActorContext = { actor: RequiredServiceActor<"user"> };

export type AIServiceGenerateTextParams = Omit<
  GenerateTextParams,
  "model" | "prompt" | "messages"
> &
  GenerateTextInput & {
    model: string;
    removeMDash?: boolean;
    ctx?: AIServiceActorContext;
    retryAttempts?: number;
    initialRetryAttempts?: number;
    retryModels?: string[];
  };

export type AIServiceGenerateObjectParams<T extends ZodType> = Omit<
  GenerateTextParams,
  "model" | "prompt" | "messages" | "output"
> &
  GenerateTextInput & {
    model: string;
    schema: T;
    safeSchema?: ZodType<any, any, any>;
    repairAttempts?: number;
    repairModel?: string;
    ctx?: AIServiceActorContext;
    retryAttempts?: number;
    initialRetryAttempts?: number;
    retryModels?: string[];
    objectType?: "object" | "array";
  };

export type AIServiceGenerateExtractedObjectParams<T extends ZodType> =
  AIServiceGenerateObjectParams<T> & {
    extractor?: Omit<AIServiceExtractObjectParams<T>, "text" | "schema">;
  };

export type AIServiceExtractObjectParams<T extends ZodType> = {
  model?: string;
  prompt?: string;
  text: string;
  schema: T;
  safeSchema?: ZodType<any, any, any>;
  objectType?: "object" | "array";
  repairAttempts?: number;
  repairModel?: string;
  retryAttempts?: number;
  initialRetryAttempts?: number;
  retryModels?: string[];
  ctx?: AIServiceActorContext;
};

type AIServiceOptions = {
  retryAttempts?: number;
  retryModels?: string[];
  repairAttempts?: number;
  repairModel?: string;
  removeMDash?: boolean;
  providerSort?: "latency" | "throughput" | "price";
};

export class AIService<MastraInstance extends Mastra> extends BaseService<
  { aiUsage?: AiUsageRepository; aiVector?: AiVectorRepository },
  { ideogram?: IdeogramService }
> {
  helpers = {
    arrayToPseudoXML,
  };

  mastra?: MastraInstance;
  openrouter?: OpenRouterProvider;
  replicate?: Replicate;
  options?: AIServiceOptions;

  constructor(
    repositories: { aiUsage?: AiUsageRepository; aiVector?: AiVectorRepository },
    services: { ideogram?: IdeogramService },
    libs: { mastra?: MastraInstance; openrouter?: OpenRouterProvider; replicate?: Replicate },
    options?: AIServiceOptions
  ) {
    super(repositories, services);
    this.mastra = libs.mastra;
    this.openrouter = libs.openrouter;
    this.replicate = libs.replicate;
    this.options = options;
  }

  getMastra(): MastraInstance {
    if (!this.mastra) {
      throw new Error("Mastra is not available");
    }
    return this.mastra;
  }

  prepareModel(
    model: string,
    options?: { objectGeneration?: boolean }
  ): ReturnType<OpenRouterProvider["chat"]> {
    if (!this.openrouter) {
      throw new Error("OpenRouter is not configured");
    }
    const provider = {
      ...(this.options?.providerSort ? { sort: this.options.providerSort } : {}),
      ...(options?.objectGeneration ? { require_parameters: true } : {}),
    };
    return this.openrouter.chat(model, {
      usage: {
        include: true,
      },
      ...(Object.keys(provider).length > 0 ? { extraBody: { provider } } : {}),
    });
  }

  prepareEmbeddingModel(model: string): ReturnType<OpenRouterProvider["textEmbeddingModel"]> {
    if (!this.openrouter) {
      throw new Error("OpenRouter is not configured");
    }
    const openrouter = this.openrouter as OpenRouterProvider & {
      embeddingModel?: (modelId: string) => unknown;
    };
    return (openrouter.embeddingModel?.(model) ??
      openrouter.textEmbeddingModel(model)) as ReturnType<OpenRouterProvider["textEmbeddingModel"]>;
  }

  async agentUse(
    agent: string,
    options: MastraAgentGenerateOptions & { prompt?: string; messages?: MessageListInput },
    ctx?: AIServiceActorContext & { model?: string }
  ): ServerResultAsync<Awaited<ReturnType<MastraModelOutput<any>["getFullOutput"]>>> {
    this.logger.info("AGENT USE");
    const { prompt, messages, ...rest } = options;
    const payload = messages || prompt;
    if (!payload) return this.error("BAD_REQUEST", "No prompt or messages provided");
    const requestContext = options.requestContext ?? new RequestContext();

    if (ctx?.actor) {
      requestContext.set("userId", ctx.actor.userId);
    }
    if (ctx?.model) {
      requestContext.set("model", ctx.model);
    }

    const mastraResult = this.throwable(() => ok(this.getMastra()));
    if (mastraResult.isErr()) return err(mastraResult.error);
    const mAgent = mastraResult.value.getAgent(agent);

    const result = await this.throwablePromise(() =>
      mAgent.generate(payload as any, {
        ...rest,
        requestContext: rest.requestContext ?? requestContext,
      })
    );
    if (result.isErr()) return err(result.error);
    this.logger.info("AGENT USE DONE");

    this.trackUsage({
      userId: ctx?.actor?.userId,
      model: ctx?.model ?? "unknown",
      provider: "openrouter",
      feature: agent,
      traceId: result.value.traceId,
      inputTokens: result.value.usage.inputTokens,
      outputTokens: result.value.usage.outputTokens,
      totalTokens: result.value.usage.totalTokens,
      cost: (result.value?.providerMetadata?.openrouter?.usage as any)?.cost ?? 0,
    });
    return ok(result.value);
  }

  async agentText(
    agent: string,
    options: MastraAgentGenerateOptions & { prompt?: string; messages?: MessageListInput },
    ctx?: AIServiceActorContext & { model?: string }
  ): ServerResultAsync<string> {
    const result = await this.agentUse(agent, options, ctx);
    if (result.isErr())
      return this.error("SERVICE_UNAVAILABLE", "AI: Agent text failed", { cause: result.error });
    return ok(result.value.text);
  }

  async agentTextResult(
    agent: string,
    options: MastraAgentGenerateOptions & { prompt?: string; messages?: MessageListInput },
    ctx?: AIServiceActorContext & { model?: string }
  ): ServerResultAsync<FullOutput<any>> {
    const result = await this.agentUse(agent, options, ctx);
    if (result.isErr()) return err(result.error);
    return ok(result.value);
  }

  async agentObject<T extends ZodType<any>>(
    agent: string,
    options: MastraAgentObjectGeneration<T>,
    ctx?: AIServiceActorContext & { model?: string }
  ): ServerResultAsync<z.infer<T>> {
    const { schema, extractor, ...rest } = options;
    const text = await this.agentText(agent, rest, ctx);
    if (text.isErr())
      return this.error("SERVICE_UNAVAILABLE", "AI: Agent object failed", { cause: text.error });

    const result = await this.extractObject({
      ctx,
      ...extractor,
      schema,
      text: text.value,
    });
    if (result.isErr())
      return this.error("SERVICE_UNAVAILABLE", "AI: Agent object failed", { cause: result.error });
    return ok(result.value);
  }

  async agentObjectResult<T extends ZodType<any>>(
    agent: string,
    options: MastraAgentObjectGeneration<T>,
    ctx?: AIServiceActorContext & { model?: string }
  ): ServerResultAsync<FullOutput<any> & { object: z.infer<T> }> {
    const { schema, extractor, ...rest } = options;
    const fullOutput = await this.agentTextResult(agent, rest, ctx);
    if (fullOutput.isErr())
      return this.error("SERVICE_UNAVAILABLE", "AI: Agent object failed", {
        cause: fullOutput.error,
      });
    const result = await this.extractObject({
      ctx,
      ...extractor,
      schema,
      text: fullOutput.value.text,
    });
    if (result.isErr())
      return this.error("SERVICE_UNAVAILABLE", "AI: Agent object failed", { cause: result.error });
    return ok({ ...fullOutput.value, object: result.value });
  }

  async upsertEmbedDocument(params: {
    indexName: string;
    value: string;
    options?: Parameters<ReturnType<typeof MDocument.fromText>["chunk"]>[0];
    type?: "text" | "markdown" | "html" | "json";
    model?: string;
    metadata?: Record<string, unknown>;
  }): ServerResultAsync<string[]> {
    if (!this.repository.aiVector)
      return this.error("INTERNAL_SERVER_ERROR", "AI vector repository is not available");

    const embeddings = await this.embedDocument(
      params.value,
      params.options,
      params.type,
      params.model
    );
    if (embeddings.isErr()) return err(embeddings.error);
    const embeddingsResult = await this.repository.aiVector.upsertEmbeddings({
      indexName: params.indexName,
      embed: {
        embeddings: embeddings.value.embeddings,
        chunks: embeddings.value.chunks,
      },
      metadata: params.metadata,
    });
    if (embeddingsResult.isErr()) return err(embeddingsResult.error);
    return ok(embeddingsResult.value);
  }

  async embedDocument(
    value: string,
    options?: Parameters<ReturnType<typeof MDocument.fromText>["chunk"]>[0],
    type: "text" | "markdown" | "html" | "json" = "text",
    model: string = OPENAI_TEXT_EMBEDDING_3_SMALL
  ): ServerResultAsync<{ embeddings: number[][]; chunks: { text: string }[] }> {
    if (type === "text") {
      const doc = MDocument.fromText(value);
      const chunksResult = await this.throwablePromise(() =>
        doc.chunk(
          options ?? {
            strategy: "recursive",
            maxSize: 512,
            overlap: 50,
            separators: ["\n"],
          }
        )
      );
      if (chunksResult.isErr()) return err(chunksResult.error);
      const chunks = chunksResult.value;

      const embeddings = await this.embedMany(chunks, model);
      if (embeddings.isErr()) return err(embeddings.error);
      return ok({ embeddings: embeddings.value.embeddings, chunks });
    }
    return this.error("BAD_REQUEST", "Unsupported document type");
  }

  async embed(
    text: string,
    model: string = OPENAI_TEXT_EMBEDDING_3_SMALL
  ): ServerResultAsync<{ embedding: number[] }> {
    const result = await this.throwablePromise(() =>
      embed({
        model: this.prepareEmbeddingModel(model),
        value: text,
      })
    );
    if (result.isErr()) return err(result.error);
    return ok(result.value);
  }

  async embedMany(
    chunks: { text: string }[],
    model: string = OPENAI_TEXT_EMBEDDING_3_SMALL
  ): ServerResultAsync<{ embeddings: number[][] }> {
    const result = await this.throwablePromise(() =>
      embedMany({
        model: this.prepareEmbeddingModel(model),
        values: chunks.map((chunk) => chunk.text),
      })
    );
    if (result.isErr()) return err(result.error);
    return ok(result.value);
  }

  async generateText(params: AIServiceGenerateTextParams): ServerResultAsync<string> {
    const {
      removeMDash = this.options?.removeMDash ?? true,
      model,
      prompt,
      messages,
      ctx,
      retryAttempts: retryAttemptsRaw = this.options?.retryAttempts ?? 0,
      initialRetryAttempts: initialRetryAttemptsRaw,
      retryModels = this.options?.retryModels ?? [],
      ...rest
    } = params;
    const retryAttempts = retryAttemptsRaw;
    const initialRetryAttempts = initialRetryAttemptsRaw ?? retryAttemptsRaw;
    // Service-level retries handle failover with model rotation; the SDK's internal
    // retries (default 2, with their own backoff) would only delay rotating models.
    const maxRetries = initialRetryAttempts > 0 ? 0 : undefined;
    const { maxRetries: _ignoredMaxRetries, ...generateTextRest } = rest as {
      maxRetries?: number;
    };
    const request = messages
      ? { ...generateTextRest, maxRetries, model: this.prepareModel(model), messages }
      : { ...generateTextRest, maxRetries, model: this.prepareModel(model), prompt };
    try {
      const result = await generateText(request);
      this.trackUsage({
        userId: ctx?.actor?.userId,
        model,
        provider: "openrouter",
        feature: "generateText",
        traceId: result.providerMetadata?.openrouter?.traceId?.toString(),
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
        cost: (result?.providerMetadata?.openrouter?.usage as any)?.cost ?? 0,
      });
      return ok(removeMDash ? result.text.replace(/\u2013|\u2014/g, "-") : result.text);
    } catch (error) {
      if (retryAttempts <= 0) {
        return this.error("INTERNAL_SERVER_ERROR", "AI: generateText failed", { cause: error });
      }
      this.logger.warn(`generateText failed, retrying (${retryAttempts} attempts left)`, {
        model,
        error,
      });
      const nextModel = retryModels?.[0] ?? model;
      const nextRetryModels = retryModels ? [...retryModels.slice(1), model] : undefined;
      if (nextModel === model) {
        // Exponential backoff only when re-hitting the same model; a different model can be tried immediately
        const attempt = Math.max(0, initialRetryAttempts - retryAttempts);
        const delay = Math.min(1000 * 2 ** attempt, 10000);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
      return this.generateText({
        ...generateTextRest,
        ...(messages ? { messages } : { prompt: prompt! }),
        model: nextModel,
        removeMDash,
        ctx,
        retryAttempts: retryAttempts - 1,
        initialRetryAttempts,
        retryModels: nextRetryModels,
      } as AIServiceGenerateTextParams);
    }
  }

  async generateObject<T extends ZodType>(
    params: AIServiceGenerateObjectParams<T>
  ): ServerResultAsync<z.infer<T>> {
    const {
      model,
      schema,
      safeSchema,
      objectType = "object",
      prompt,
      messages,
      repairAttempts = this.options?.repairAttempts ?? 0,
      repairModel = this.options?.repairModel ?? model,
      ctx,
      retryAttempts: retryAttemptsRaw = this.options?.retryAttempts ?? 0,
      initialRetryAttempts: initialRetryAttemptsRaw,
      retryModels = this.options?.retryModels ?? [],
      ...rest
    } = params;
    const retryAttempts = retryAttemptsRaw;
    const initialRetryAttempts = initialRetryAttemptsRaw ?? retryAttemptsRaw;
    // Service-level retries handle failover with model rotation; the SDK's internal
    // retries (default 2, with their own backoff) would only delay rotating models.
    const maxRetries = initialRetryAttempts > 0 ? 0 : undefined;
    const { maxRetries: _ignoredMaxRetries, ...generateTextRest } = rest as {
      maxRetries?: number;
    };
    const output =
      objectType === "object"
        ? safeSchema
          ? Output.object({ schema: safeSchema })
          : Output.object({ schema })
        : safeSchema
          ? Output.array({ element: (safeSchema as unknown as z.ZodArray<any>).unwrap() })
          : Output.array({ element: (schema as unknown as z.ZodArray<any>).unwrap() });
    const request = messages
      ? {
          ...generateTextRest,
          maxRetries,
          model: this.prepareModel(model, { objectGeneration: true }),
          messages,
          output,
        }
      : {
          ...generateTextRest,
          maxRetries,
          model: this.prepareModel(model, { objectGeneration: true }),
          prompt,
          output,
        };
    const retryContext = {
      retryAttempts,
      initialRetryAttempts,
      retryModels,
    };
    try {
      const result = await generateText(request);
      this.trackUsage({
        userId: ctx?.actor?.userId,
        model,
        provider: "openrouter",
        feature: "generateObject",
        traceId: result.providerMetadata?.openrouter?.traceId?.toString(),
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
        cost: (result?.providerMetadata?.openrouter?.usage as any)?.cost ?? 0,
      });

      if (safeSchema) {
        const parsed = schema.safeParse(result.output);

        if (parsed.success) return ok(parsed.data);

        if (repairAttempts > 0) {
          const assistantMessage: ModelMessage = {
            role: "assistant",
            content: JSON.stringify(result.output),
          };
          const userMessage: ModelMessage = {
            role: "user",
            content: repairZodPrompt.compile({
              issues: JSON.stringify(parsed.error.issues),
            }),
          };
          const baseMessages: ModelMessage[] =
            messages ??
            (Array.isArray(prompt)
              ? prompt
              : [{ role: "user", content: prompt ?? "" } as ModelMessage]);
          return this.generateObject({
            ...generateTextRest,
            messages: [...baseMessages, assistantMessage, userMessage],
            repairAttempts: repairAttempts - 1,
            repairModel,
            model: repairModel ?? model,
            schema,
            safeSchema,
            objectType,
            ctx,
            ...retryContext,
          });
        }

        const retried = this.retryGenerateObject({
          error: parsed.error,
          generateTextRest,
          model,
          prompt,
          messages,
          schema,
          safeSchema,
          objectType,
          repairAttempts,
          repairModel,
          ctx,
          ...retryContext,
        });
        if (retried) return retried;

        // BAD_GATEWAY: provider output failing the schema is an upstream fault (PARSE_ERROR maps to HTTP 400)
        return this.error("BAD_GATEWAY", "AI: Agent strict object failed", {
          cause: parsed.error,
        });
      }

      return ok(result.output as z.infer<T>);
    } catch (error) {
      const objectError = this.resolveNoObjectGeneratedError(error);
      if (objectError) {
        this.trackUsage({
          userId: ctx?.actor?.userId,
          model,
          provider: "openrouter",
          feature: "generateObject",
          traceId: null,
          inputTokens: objectError?.usage?.inputTokens,
          outputTokens: objectError?.usage?.outputTokens,
          totalTokens: objectError?.usage?.totalTokens,
          cost: 0,
        });
        if (objectError.text) {
          try {
            const repaired: unknown = JSON.parse(jsonrepair(objectError.text));
            const parsed = schema.safeParse(repaired);
            if (parsed.success) return ok(parsed.data);
          } catch {
            // jsonrepair throws on unrepairable text; fall through to LLM repair
          }

          if (repairAttempts > 0) {
            return this.generateObject({
              ...generateTextRest,
              prompt: repairJsonPrompt.compile({
                text: objectError.text,
                error:
                  objectError.cause instanceof Error
                    ? objectError.cause.message
                    : JSON.stringify(objectError.cause ?? "Unknown error"),
                schema: this.stringifySchema(schema),
              }),
              repairAttempts: repairAttempts - 1,
              repairModel,
              model: repairModel ?? model,
              schema,
              safeSchema,
              objectType,
              ctx,
              ...retryContext,
            });
          }

          const retried = this.retryGenerateObject({
            error: objectError,
            generateTextRest,
            model,
            prompt,
            messages,
            schema,
            safeSchema,
            objectType,
            repairAttempts,
            repairModel,
            ctx,
            ...retryContext,
          });
          if (retried) return retried;

          return this.error("BAD_GATEWAY", "AI: Agent object failed", { cause: objectError });
        }

        const retried = this.retryGenerateObject({
          error: objectError,
          generateTextRest,
          model,
          prompt,
          messages,
          schema,
          safeSchema,
          objectType,
          repairAttempts,
          repairModel,
          ctx,
          ...retryContext,
        });
        if (retried) return retried;

        return this.error("BAD_GATEWAY", "AI: Agent object failed without text", {
          cause: objectError,
        });
      }

      const retried = this.retryGenerateObject({
        error,
        generateTextRest,
        model,
        prompt,
        messages,
        schema,
        safeSchema,
        objectType,
        repairAttempts,
        repairModel,
        ctx,
        ...retryContext,
      });
      if (retried) return retried;

      return this.error("BAD_GATEWAY", "AI: Provider failed to generate object", {
        cause: error,
      });
    }
  }

  async generateExtractedObject<T extends ZodType>(
    params: AIServiceGenerateExtractedObjectParams<T>
  ): ServerResultAsync<z.infer<T>> {
    const { schema, extractor, ...rest } = params;
    if (rest.messages)
      return this.error(
        "INTERNAL_SERVER_ERROR",
        "Messages are not supported for extracted object generation"
      );

    const textResult = await this.generateText({ ...rest });
    if (textResult.isErr()) return err(textResult.error);

    const result = await this.extractObject({
      ctx: rest.ctx,
      ...extractor,
      text: textResult.value,
      schema,
    });
    if (result.isErr()) return err(result.error);
    return ok(result.value);
  }

  async extractObject<T extends ZodType>({
    model = STRUCTURED_OUTPUT_FAST,
    prompt = extractObjectPrompt,
    text,
    schema,
    ...rest
  }: AIServiceExtractObjectParams<T>): ServerResultAsync<z.infer<T>> {
    // Function replacers so "$"-patterns in the interpolated values are not treated as substitutions
    const compiledPrompt = prompt
      .replaceAll("{{schema}}", () => this.stringifySchema(schema))
      .replaceAll("{{text}}", () => text);
    const result = await this.generateObject({
      ...rest,
      schema,
      prompt: compiledPrompt,
      model,
      temperature: 0,
    });
    if (result.isErr()) return err(result.error);
    return ok(result.value);
  }

  private schemaJsonCache = new WeakMap<ZodType, string>();

  private resolveNoObjectGeneratedError(
    error: unknown
  ): InstanceType<typeof NoObjectGeneratedError> | null {
    let current: unknown = error;
    const visited = new Set<unknown>();

    while (current != null && !visited.has(current)) {
      visited.add(current);

      if (NoObjectGeneratedError.isInstance(current)) {
        return current;
      }

      if (RetryError.isInstance(current)) {
        current = current.lastError ?? current.errors.at(-1);
        continue;
      }

      if (current instanceof Error && current.cause != null) {
        current = current.cause;
        continue;
      }

      break;
    }

    return null;
  }

  private retryGenerateObject<T extends ZodType>({
    error,
    generateTextRest,
    model,
    prompt,
    messages,
    schema,
    safeSchema,
    objectType,
    repairAttempts,
    repairModel,
    ctx,
    retryAttempts,
    initialRetryAttempts,
    retryModels,
  }: {
    error: unknown;
    generateTextRest: Omit<
      AIServiceGenerateObjectParams<T>,
      | "model"
      | "schema"
      | "safeSchema"
      | "objectType"
      | "prompt"
      | "messages"
      | "repairAttempts"
      | "repairModel"
      | "ctx"
      | "retryAttempts"
      | "initialRetryAttempts"
      | "retryModels"
    >;
    model: string;
    prompt?: AIServiceGenerateObjectParams<T>["prompt"];
    messages?: AIServiceGenerateObjectParams<T>["messages"];
    schema: T;
    safeSchema?: AIServiceGenerateObjectParams<T>["safeSchema"];
    objectType: NonNullable<AIServiceGenerateObjectParams<T>["objectType"]>;
    repairAttempts: number;
    repairModel: string;
    ctx?: AIServiceGenerateObjectParams<T>["ctx"];
    retryAttempts: number;
    initialRetryAttempts: number;
    retryModels: string[];
  }): ServerResultAsync<z.infer<T>> | null {
    if (retryAttempts <= 0) return null;

    this.logger.warn(`generateObject failed, retrying (${retryAttempts} attempts left)`, {
      model,
      error,
    });

    const nextModel = retryModels[0] ?? model;
    const nextRetryModels = retryModels.length > 0 ? [...retryModels.slice(1), model] : undefined;
    const attempt = Math.max(0, initialRetryAttempts - retryAttempts);
    const delay = nextModel === model ? Math.min(1000 * 2 ** attempt, 10000) : 0;

    const runRetry = async (): ServerResultAsync<z.infer<T>> => {
      if (delay > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }

      return this.generateObject({
        ...generateTextRest,
        ...(messages ? { messages } : { prompt: prompt! }),
        model: nextModel,
        schema,
        safeSchema,
        objectType,
        repairAttempts,
        repairModel,
        ctx,
        retryAttempts: retryAttempts - 1,
        initialRetryAttempts,
        retryModels: nextRetryModels,
      });
    };

    return runRetry();
  }

  private stringifySchema(schema: ZodType): string {
    const cached = this.schemaJsonCache.get(schema);
    if (cached !== undefined) return cached;
    let json: string;
    try {
      json = JSON.stringify(z.toJSONSchema(schema, { unrepresentable: "any" }));
    } catch {
      json = "";
    }
    this.schemaJsonCache.set(schema, json);
    return json;
  }

  // Fire-and-forget so the usage row write never sits on the response's critical path
  private trackUsage(row: Parameters<AiUsageRepository["create"]>[0]): void {
    const aiUsage = this.repository.aiUsage;
    if (!aiUsage) return;
    void Promise.resolve()
      .then(() => aiUsage.create(row))
      .then((result) => {
        if (result.isErr()) this.logger.warn("AI usage tracking failed", { error: result.error });
      })
      .catch((error) => this.logger.warn("AI usage tracking failed", { error }));
  }

  async generateReplicate(
    model: Parameters<Replicate["run"]>[0],
    options: Parameters<Replicate["run"]>[1]
  ): ServerResultAsync<object> {
    if (!this.replicate) {
      return this.error("INTERNAL_SERVER_ERROR", "Replicate is not configured");
    }
    const result = await this.throwablePromise(() => this.replicate!.run(model, options));
    if (result.isErr()) return err(result.error);
    return ok(result.value as object);
  }

  async generateTranscript(
    file_url: string
  ): ServerResultAsync<{ text: string; metadata: unknown }> {
    const output = await this.generateReplicate(
      "thomasmol/whisper-diarization:1495a9cddc83b2203b0d8d3516e38b80fd1572ebc4bc5700ac1da56a9b3ed886",
      {
        input: {
          file_url,
        },
      }
    );

    if (output.isErr()) return err(output.error);

    try {
      const { segments } = output.value as { segments: { text: string }[] };
      return ok({ text: segments.map((segment) => segment.text).join(""), metadata: segments });
    } catch (error) {
      return this.error("INTERNAL_SERVER_ERROR", undefined, { cause: error });
    }
  }

  async generateIdeogram(
    input: IdeogramV3GenerateInput
  ): ServerResultAsync<IdeogramV3GenerateOutput> {
    if (!this.service.ideogram) {
      return this.error("INTERNAL_SERVER_ERROR", "Ideogram service is not available");
    }
    return this.service.ideogram.generate(input);
  }

  async getUsage(
    userId: string
  ): ServerResultAsync<Pick<AiUsageRow, "inputTokens" | "outputTokens" | "totalTokens" | "cost">> {
    if (!this.repository.aiUsage) {
      return this.error("INTERNAL_SERVER_ERROR", "AI usage repository is not available");
    }
    return this.repository.aiUsage.getUsage(userId);
  }
}
