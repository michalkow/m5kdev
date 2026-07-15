import { OPENAI_TEXT_EMBEDDING_3_SMALL } from "@m5kdev/commons/modules/ai/ai.constants";
import { arrayToPseudoXML } from "@m5kdev/commons/modules/ai/ai.utils";
import { safeParseJson } from "@m5kdev/commons/utils/json";
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
  NoOutputGeneratedError,
  Output,
} from "ai";
import { jsonrepair } from "jsonrepair";
import { err, ok } from "neverthrow";
import type Replicate from "replicate";
import type { ZodType, z } from "zod";
import type { RequiredServiceActor } from "../base/base.actor";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseService } from "../base/base.service";
import { extractObjectPrompt, repairJsonPrompt, repairZodPrompt } from "./ai.prompts";
import type { AiUsageRepository, AiUsageRow, AiVectorRepository } from "./ai.repository";
import { type PresetModels, resolveModels, resolveRetryModels } from "./ai.utils";
import type { IdeogramV3GenerateInput, IdeogramV3GenerateOutput } from "./ideogram/ideogram.dto";
import type { IdeogramService } from "./ideogram/ideogram.service";

type MastraAgent = ReturnType<Mastra["getAgent"]>;
type MastraAgentGenerateOptions = Parameters<MastraAgent["generate"]>[1];
type MastraAgentObjectGeneration<T extends ZodType> = MastraAgentGenerateOptions & {
  schema: T;
  prompt?: string;
  messages?: MessageListInput;
  extractor?: {
    model?: string;
    prompt?: string;
  };
};
type MessageListInput = { role: "user" | "assistant" | "system"; content: string }[];
type GenerateTextParams = Parameters<typeof generateText>[0];
type GenerateTextInput =
  | { prompt: string; messages?: never }
  | { messages: ModelMessage[]; prompt?: never };
type AIServiceActorContext = { actor: RequiredServiceActor<"user"> };

export type AIServiceGenerateTextParams = Omit<
  GenerateTextParams,
  "model" | "prompt" | "messages"
> &
  GenerateTextInput & {
    presetModels?: PresetModels;
    models?: string[];
    model?: string;
    removeMDash?: boolean;
    ctx?: AIServiceActorContext;
    retryAttempts?: number;
    initialRetryAttempts?: number;
  };

export type AIServiceGenerateObjectParams<T extends ZodType> = Omit<
  GenerateTextParams,
  "model" | "prompt" | "messages" | "output"
> &
  GenerateTextInput & {
    prompt?: string;
    messages?: ModelMessage[];
    presetModels?: PresetModels;
    models?: string[];
    model?: string;
    schema: T;
    safeSchema?: ZodType<any, any, any>;
    repairAttempts?: number;
    initialRepairAttempts?: number;
    repairModels?: string[];
    repairModel?: string;
    ctx?: AIServiceActorContext;
    retryAttempts?: number;
    initialRetryAttempts?: number;
    objectType?: "object" | "array";
    originalContent?: GenerateTextInput;
  };

export type AIServiceGenerateExtractedObjectParams<T extends ZodType> =
  AIServiceGenerateObjectParams<T> & {
    extractor?: {
      model?: string;
      prompt?: string;
    };
  };

export type AIServiceExtractObjectParams<T extends ZodType> = {
  model?: string;
  prompt?: string;
  text: string;
  schema: T;
};

type AIServiceOptions = {
  retryAttempts?: number;
  retryModels?: string[];
  repairAttempts?: number;
  repairModel?: string;
  removeMDash?: boolean;
  objectPreset?: PresetModels;
  textPreset?: PresetModels;
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
    return this.openrouter.chat(model, {
      usage: {
        include: true,
      },
      ...(options?.objectGeneration
        ? {
            extraBody: {
              provider: {
                require_parameters: true,
              },
            },
          }
        : {}),
    });
  }

  prepareEmbeddingModel(model: string): ReturnType<OpenRouterProvider["textEmbeddingModel"]> {
    if (!this.openrouter) {
      throw new Error("OpenRouter is not configured");
    }
    return this.openrouter.textEmbeddingModel(model);
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

    if (this.repository.aiUsage) {
      const createUsageResult = await this.repository.aiUsage.create({
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
      if (createUsageResult.isErr()) return err(createUsageResult.error);
    }
    this.logger.info("AGENT USE CREATED USAGE");
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
    const text = await this.agentText(agent, rest, ctx);
    if (text.isErr())
      return this.error("SERVICE_UNAVAILABLE", "AI: Agent object failed", { cause: text.error });

    const result = await this.extractObject({
      ...extractor,
      schema,
      text: text.value,
    });
    if (result.isErr())
      return this.error("SERVICE_UNAVAILABLE", "AI: Agent object failed", { cause: result.error });
    return ok(result.value);
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

  async trackUsage(params: {
    ctx?: AIServiceActorContext;
    feature: string;
    model: string;
    result: {
      usage?: {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
      };
      providerMetadata?: {
        openrouter?: {
          traceId?: string;
          usage?: {
            cost?: number;
          };
        };
      };
    };
  }): Promise<void> {
    if (!this.repository.aiUsage) return Promise.resolve();
    try {
      await this.repository.aiUsage.create({
        userId: params.ctx?.actor?.userId,
        model: params.model,
        provider: "openrouter",
        feature: params.feature,
        traceId: params.result.providerMetadata?.openrouter?.traceId?.toString(),
        inputTokens: params.result.usage?.inputTokens ?? 0,
        outputTokens: params.result.usage?.outputTokens ?? 0,
        totalTokens: params.result.usage?.totalTokens ?? 0,
        cost: (params.result?.providerMetadata?.openrouter?.usage as any)?.cost ?? 0,
      });
    } catch (error) {
      this.logger.error({ label: "AI: trackUsage", error });
    }
  }

  async generateText(params: AIServiceGenerateTextParams): ServerResultAsync<string> {
    const resolvedParams = Object.assign({}, params, {
      presetModels: params.presetModels ?? this.options?.textPreset,
      removeMDash: params.removeMDash ?? this.options?.removeMDash ?? true,
      retryAttempts: params.retryAttempts ?? this.options?.retryAttempts ?? 0,
      initialRetryAttempts: params.initialRetryAttempts ?? params.retryAttempts ?? 0,
    });

    const {
      removeMDash,
      model,
      models,
      presetModels,
      prompt,
      messages,
      ctx,
      retryAttempts,
      initialRetryAttempts,
      ...rest
    } = resolvedParams;

    const resolvedModels = resolveModels({ models, presetModels, model, defaultCategory: "chat" });
    const [resolvedModel] = resolvedModels;

    if (!resolvedModel) return this.error("INTERNAL_SERVER_ERROR", "AI: No models not provided");

    const preparedModel = this.prepareModel(resolvedModel);
    const content = messages ? { messages } : prompt ? { prompt } : undefined;
    if (!content)
      return this.error("INTERNAL_SERVER_ERROR", "AI: No messages or prompt not provided");

    try {
      const result = await generateText({ ...rest, ...content, model: preparedModel });
      await this.trackUsage({
        ctx,
        model: resolvedModel,
        feature: "generateText",
        result,
      });
      return ok(removeMDash ? result.text.replace(/\u2013|\u2014/g, "-") : result.text);
    } catch (error) {
      if (retryAttempts <= 0) {
        return this.error("INTERNAL_SERVER_ERROR", "AI: generateText failed", { cause: error });
      }
      this.logger.warn(
        `generateText failed, retrying (${retryAttempts}/${initialRetryAttempts} attempts left)`,
        {
          model,
          error,
        }
      );

      return this.generateText({
        ...resolvedParams,
        models: resolveRetryModels(resolvedModels),
        retryAttempts: retryAttempts - 1,
      });
    }
  }

  async generateObject<T extends ZodType>(
    params: AIServiceGenerateObjectParams<T>
  ): ServerResultAsync<z.infer<T>> {
    const resolvedParams = Object.assign({}, params, {
      temperature: params.temperature ?? 0,
      presetModels: params.presetModels ?? this.options?.objectPreset,
      objectType: params.objectType ?? "object",
      repairAttempts: params.repairAttempts ?? this.options?.repairAttempts ?? 0,
      repairModel: params.repairModel ?? this.options?.repairModel,
      initialRepairAttempts:
        params.initialRepairAttempts ?? params.repairAttempts ?? this.options?.repairAttempts ?? 0,
      retryAttempts: params.retryAttempts ?? this.options?.retryAttempts ?? 0,
      initialRetryAttempts:
        params.initialRetryAttempts ?? params.retryAttempts ?? this.options?.retryAttempts ?? 0,
    });

    const {
      model,
      models,
      presetModels,
      schema,
      safeSchema,
      objectType,
      prompt,
      messages,
      repairAttempts,
      initialRepairAttempts,
      originalContent,
      repairModel,
      ctx,
      retryAttempts,
      initialRetryAttempts,
      ...rest
    } = resolvedParams;

    const output =
      objectType === "object"
        ? safeSchema
          ? Output.object({ schema: safeSchema })
          : Output.object({ schema })
        : safeSchema
          ? Output.array({ element: (safeSchema as unknown as z.ZodArray<any>).unwrap() })
          : Output.array({ element: (schema as unknown as z.ZodArray<any>).unwrap() });

    const resolvedModels = resolveModels({
      models,
      presetModels,
      model,
      defaultCategory: "structured_output",
    });

    const [resolvedModel] = resolvedModels;

    if (!resolvedModel) return this.error("INTERNAL_SERVER_ERROR", "AI: No models not provided");
    if (initialRetryAttempts !== retryAttempts || initialRepairAttempts !== repairAttempts)
      this.logger.warn(
        `Last attempt at object generation failed: (model: ${resolvedModel}, retry: ${initialRetryAttempts}/${retryAttempts}, repair: ${initialRepairAttempts}/${repairAttempts})`
      );
    else
      this.logger.info(
        `First attempt at object generation: (model: ${resolvedModel}, retry: ${initialRetryAttempts}/${retryAttempts}, repair: ${initialRepairAttempts}/${repairAttempts})`
      );
    const preparedModel = this.prepareModel(resolvedModel, { objectGeneration: true });

    const content = messages ? { messages } : prompt ? { prompt } : undefined;
    if (!content)
      return this.error("INTERNAL_SERVER_ERROR", "AI: No messages or prompt not provided");

    function getRetryParams() {
      return {
        ...resolvedParams,
        ...(originalContent as { prompt: string; messages: never }),
        models: resolveRetryModels(resolvedModels),
        retryAttempts: retryAttempts - 1,
        repairAttempts: initialRepairAttempts,
      };
    }

    function getRepairParams(prompt: string) {
      return {
        ...resolvedParams,
        models: repairAttempts ? resolvedModels : resolveRetryModels(resolvedModels),
        messages: undefined,
        originalContent: content as GenerateTextParams,
        repairAttempts: repairAttempts - 1,
        prompt,
      } as AIServiceGenerateObjectParams<T>;
    }

    try {
      const result = await generateText({
        ...rest,
        ...content,
        model: preparedModel,
        output,
      });
      await this.trackUsage({
        ctx,
        model: resolvedModel,
        feature: "generateObject",
        result,
      });

      if (safeSchema) {
        const parsed = schema.safeParse(result.output);

        if (parsed.success) return ok(parsed.data);

        if (repairAttempts <= 0) {
          if (retryAttempts > 0) return this.generateObject(getRetryParams());

          // BAD_GATEWAY: provider output failing the schema is an upstream fault (PARSE_ERROR maps to HTTP 400)
          return this.error("BAD_GATEWAY", "AI: Strict object failed", {
            cause: parsed.error,
          });
        }

        return this.generateObject(
          getRepairParams(
            repairZodPrompt.compile({
              issues: JSON.stringify(parsed.error.issues),
              schema: JSON.stringify(result.output),
            })
          )
        );
      }
      this.logger.info({ label: "AI: generateObject output", output: result.output });
      return ok(result.output);
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        await this.trackUsage({
          ctx,
          model: resolvedModel,
          feature: "generateObject",
          result: {
            usage: error.usage,
          },
        });

        if (error.text) {
          const repairedText = jsonrepair(error.text);
          const repairedObject = safeParseJson(repairedText);
          const parsed = schema.safeParse(repairedObject);

          if (parsed.success) return ok(parsed.data);

          if (repairAttempts <= 0) {
            if (retryAttempts > 0) return this.generateObject(getRetryParams());

            // BAD_GATEWAY: provider output failing the schema is an upstream fault (PARSE_ERROR maps to HTTP 400)
            return this.error("BAD_GATEWAY", "AI: Strict object from JSON repair failed", {
              cause: parsed.error,
            });
          }

          return this.generateObject(
            getRepairParams(
              repairJsonPrompt.compile({
                text: error.text,
                error: JSON.stringify(error.cause ?? "Unknown error"),
              })
            )
          );
        }

        if (retryAttempts > 0) return this.generateObject(getRetryParams());

        return this.error(
          "BAD_GATEWAY",
          "AI: Provider object from JSON repair failed without text",
          {
            cause: error,
          }
        );
      }

      if (retryAttempts > 0) return this.generateObject(getRetryParams());

      return this.error("BAD_GATEWAY", "AI: Provider failed to generate object: Unknown error", {
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
      ...extractor,
      text: textResult.value,
      schema,
    });
    if (result.isErr()) return err(result.error);
    return ok(result.value);
  }

  async extractObject<T extends ZodType>({
    model,
    prompt = extractObjectPrompt,
    text,
    schema,
  }: AIServiceExtractObjectParams<T>): ServerResultAsync<z.infer<T>> {
    const resolvedModels = resolveModels({ model, defaultCategory: "structured_output" });
    const [resolvedModel] = resolvedModels;
    if (!resolvedModel) return this.error("INTERNAL_SERVER_ERROR", "AI: No models not provided");
    const result = await this.generateObject({
      schema,
      prompt: prompt.replaceAll("{{text}}", text),
      model: resolvedModel,
      temperature: 0,
    });
    if (result.isErr()) return err(result.error);
    return ok(result.value);
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
