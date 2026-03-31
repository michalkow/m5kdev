import { OPENAI_TEXT_EMBEDDING_3_SMALL } from "@m5kdev/commons/modules/ai/ai.constants";
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
} from "ai";
import { jsonrepair } from "jsonrepair";
import { err, ok } from "neverthrow";
import type Replicate from "replicate";
import type { ZodType, z } from "zod";
import type { RequiredServiceActor } from "../base/base.actor";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseService } from "../base/base.service";
import { repairJsonPrompt } from "./ai.prompts";
import type { AiUsageRepository, AiUsageRow } from "./ai.repository";
import type { IdeogramV3GenerateInput, IdeogramV3GenerateOutput } from "./ideogram/ideogram.dto";
import type { IdeogramService } from "./ideogram/ideogram.service";

type MastraAgent = ReturnType<Mastra["getAgent"]>;
type MastraAgentGenerateOptions = Parameters<MastraAgent["generate"]>[1];
type MessageListInput = { role: "user" | "assistant" | "system"; content: string }[];
type GenerateTextParams = Parameters<typeof generateText>[0];
type GenerateTextInput =
  | { prompt: string | ModelMessage[]; messages?: never }
  | { messages: ModelMessage[]; prompt?: never };
type AIServiceActorContext = { actor: RequiredServiceActor<"user"> };
type AIServiceGenerateTextParams = Omit<GenerateTextParams, "model" | "prompt" | "messages"> &
  GenerateTextInput & {
    model: string;
    removeMDash?: boolean;
    ctx?: AIServiceActorContext;
    retryAttempts?: number;
    retryModels?: string[];
  };
type AIServiceGenerateObjectParams<T extends ZodType> = Omit<
  GenerateTextParams,
  "model" | "prompt" | "messages" | "output"
> &
  GenerateTextInput & {
    model: string;
    schema: T;
    repairAttempts?: number;
    repairModel?: string;
    ctx?: AIServiceActorContext;
    retryAttempts?: number;
    retryModels?: string[];
  };

type AIServiceOptions = {
  retryAttempts?: number;
  retryModels?: string[];
  repairAttempts?: number;
  repairModel?: string;
  removeMDash?: boolean;
};

export class AIService<MastraInstance extends Mastra> extends BaseService<
  { aiUsage?: AiUsageRepository },
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
    repositories: { aiUsage?: AiUsageRepository },
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

  prepareModel(model: string): ReturnType<OpenRouterProvider["chat"]> {
    if (!this.openrouter) {
      throw new Error("OpenRouter is not configured");
    }
    return this.openrouter.chat(model, {
      usage: {
        include: true,
      },
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
    return this.throwableAsync(async () => {
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
      const mAgent = this.getMastra().getAgent(agent);

      const result = await mAgent.generate(payload as any, {
        ...rest,
        requestContext: rest.requestContext ?? requestContext,
      });
      this.logger.info("AGENT USE DONE");
      if (this.repository.aiUsage) {
        const createUsageResult = await this.repository.aiUsage.create({
          userId: ctx?.actor?.userId,
          model: ctx?.model ?? "unknown",
          provider: "openrouter",
          feature: agent,
          traceId: result.traceId,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
          cost: (result?.providerMetadata?.openrouter?.usage as any)?.cost ?? 0,
        });
        if (createUsageResult.isErr()) return err(createUsageResult.error);
      }
      this.logger.info("AGENT USE CREATED USAGE");
      return ok(result);
    });
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
    options: MastraAgentGenerateOptions & {
      schema: T;
      prompt?: string;
      messages?: MessageListInput;
    },
    ctx?: AIServiceActorContext & { model?: string }
  ): ServerResultAsync<z.infer<T>> {
    const { schema, ...rest } = options;
    const result = await this.agentUse(agent, { ...rest, structuredOutput: { schema } }, ctx);
    if (result.isErr())
      return this.error("SERVICE_UNAVAILABLE", "AI: Agent object failed", { cause: result.error });
    return ok(result.value.object as z.infer<T>);
  }

  async agentObjectResult<T extends ZodType<any>>(
    agent: string,
    options: MastraAgentGenerateOptions & {
      schema: T;
      prompt?: string;
      messages?: MessageListInput;
    },
    ctx?: AIServiceActorContext & { model?: string }
  ): ServerResultAsync<FullOutput<any> & { object: z.infer<T> }> {
    this.logger.info("AGENT OBJECT RESULT");
    const { schema, ...rest } = options;
    const result = await this.agentUse(agent, { ...rest, structuredOutput: { schema } }, ctx);
    if (result.isErr()) return err(result.error);
    this.logger.info("AGENT OBJECT RESULT DONE");
    return ok({ ...result.value, object: result.value.object as z.infer<T> });
  }

  async embedDocument(
    value: string,
    options?: Parameters<ReturnType<typeof MDocument.fromText>["chunk"]>[0],
    type: "text" | "markdown" | "html" | "json" = "text",
    model: string = OPENAI_TEXT_EMBEDDING_3_SMALL
  ): ServerResultAsync<{ embeddings: number[][]; chunks: { text: string }[] }> {
    return this.throwableAsync(async () => {
      if (type === "text") {
        const doc = MDocument.fromText(value);
        const chunks = await doc.chunk(
          options ?? {
            strategy: "recursive",
            maxSize: 512,
            overlap: 50,
            separators: ["\n"],
          }
        );
        const embeddings = await this.embedMany(chunks, model);
        if (embeddings.isErr()) return err(embeddings.error);
        return ok({ embeddings: embeddings.value.embeddings, chunks });
      }
      return this.error("BAD_REQUEST", "Unsupported document type");
    });
  }

  async embed(
    text: string,
    model: string = OPENAI_TEXT_EMBEDDING_3_SMALL
  ): ServerResultAsync<{ embedding: number[] }> {
    return this.throwableAsync(async () => {
      const result = await embed({
        model: this.prepareEmbeddingModel(model),
        value: text,
      });
      return ok(result);
    });
  }

  async embedMany(
    chunks: { text: string }[],
    model: string = OPENAI_TEXT_EMBEDDING_3_SMALL
  ): ServerResultAsync<{ embeddings: number[][] }> {
    return this.throwableAsync(async () => {
      const result = await embedMany({
        model: this.prepareEmbeddingModel(model),
        values: chunks.map((chunk) => chunk.text),
      });
      return ok(result);
    });
  }

  async generateText(params: AIServiceGenerateTextParams): ServerResultAsync<string> {
    return this.throwableAsync(async () => {
      const {
        removeMDash = this.options?.removeMDash ?? true,
        model,
        prompt,
        messages,
        ctx,
        retryAttempts = this.options?.retryAttempts ?? 0,
        retryModels = this.options?.retryModels ?? [],
        ...rest
      } = params;
      const request = messages
        ? { ...rest, model: this.prepareModel(model), messages }
        : { ...rest, model: this.prepareModel(model), prompt };
      try {
        const result = await generateText(request);
        if (this.repository.aiUsage) {
          const createUsageResult = await this.repository.aiUsage.create({
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
          if (createUsageResult.isErr()) return err(createUsageResult.error);
        }
        return ok(removeMDash ? result.text.replace(/\u2013|\u2014/g, "-") : result.text);
      } catch (error) {
        if (retryAttempts <= 0) throw error;
        this.logger.warn(`generateText failed, retrying (${retryAttempts} attempts left)`, {
          model,
          error,
        });
        // Exponential backoff: wait before retrying
        const delay = Math.min(
          1000 * 2 ** ((this.options?.retryAttempts ?? 3) - retryAttempts),
          10000
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
        const nextModel = retryModels?.[0] ?? model;
        const nextRetryModels = retryModels ? [...retryModels.slice(1), model] : undefined;
        return this.generateText({
          ...rest,
          ...(messages ? { messages } : { prompt: prompt! }),
          model: nextModel,
          removeMDash,
          ctx,
          retryAttempts: retryAttempts - 1,
          retryModels: nextRetryModels,
        } as AIServiceGenerateTextParams);
      }
    });
  }

  async generateObject<T extends ZodType>(
    params: AIServiceGenerateObjectParams<T>
  ): ServerResultAsync<z.infer<T>> {
    const {
      model,
      schema,
      prompt,
      messages,
      repairAttempts = this.options?.repairAttempts ?? 0,
      repairModel = this.options?.repairModel ?? model,
      ctx,
      retryAttempts = this.options?.retryAttempts ?? 0,
      retryModels = this.options?.retryModels ?? [],
      ...rest
    } = params;
    const request = messages
      ? {
          ...rest,
          model: this.prepareModel(model),
          messages,
          output: Output.object({ schema }),
        }
      : {
          ...rest,
          model: this.prepareModel(model),
          prompt,
          output: Output.object({ schema }),
        };
    try {
      const result = await generateText(request);
      if (this.repository.aiUsage) {
        const createUsageResult = await this.repository.aiUsage.create({
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
        if (createUsageResult.isErr()) return err(createUsageResult.error);
      }
      return ok(result.output as z.infer<T>);
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        if (this.repository.aiUsage) {
          const createUsageResult = await this.repository.aiUsage.create({
            userId: ctx?.actor?.userId,
            model,
            provider: "openrouter",
            feature: "generateObject",
            traceId: null,
            inputTokens: error?.usage?.inputTokens,
            outputTokens: error?.usage?.outputTokens,
            totalTokens: error?.usage?.totalTokens,
            cost: 0,
          });
          if (createUsageResult.isErr()) return err(createUsageResult.error);
        }
        if (error.text) {
          const repairedText = jsonrepair(error.text);
          const parsed = schema.safeParse(repairedText);
          if (parsed.success) return ok(parsed.data);

          if (repairAttempts === 0)
            return this.error("PARSE_ERROR", "AI: Agent object failed", { cause: error });

          return this.generateObject({
            ...rest,
            prompt: repairJsonPrompt.compile({
              text: error.text,
              error: JSON.stringify(error.cause ?? "Unknown error"),
            }),
            repairAttempts: repairAttempts - 1,
            model: repairModel ?? model,
            schema,
            ctx,
          });
        }
        return this.error("PARSE_ERROR", "AI: Agent object failed without text", {
          cause: error,
        });
      }
      if (retryAttempts <= 0)
        return this.error("BAD_REQUEST", "AI: Provider failed to generate object", {
          cause: error,
        });
      this.logger.warn(`generateObject failed, retrying (${retryAttempts} attempts left)`, {
        model,
        error,
      });
      // Exponential backoff: wait before retrying
      const delay = Math.min(
        1000 * 2 ** ((this.options?.retryAttempts ?? 3) - retryAttempts),
        10000
      );
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      const nextModel = retryModels?.[0] ?? model;
      const nextRetryModels = retryModels ? [...retryModels.slice(1), model] : undefined;
      return this.generateObject({
        ...rest,
        ...(messages ? { messages } : { prompt: prompt! }),
        model: nextModel,
        schema,
        repairAttempts,
        repairModel,
        ctx,
        retryAttempts: retryAttempts - 1,
        retryModels: nextRetryModels,
      } as AIServiceGenerateObjectParams<T>);
    }
  }

  async generateReplicate(
    model: Parameters<Replicate["run"]>[0],
    options: Parameters<Replicate["run"]>[1]
  ): ServerResultAsync<object> {
    return this.throwableAsync(async () => {
      if (!this.replicate) {
        return this.error("INTERNAL_SERVER_ERROR", "Replicate is not configured");
      }
      try {
        return ok(await this.replicate.run(model, options));
      } catch (error) {
        return this.error("INTERNAL_SERVER_ERROR", undefined, { cause: error });
      }
    });
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
