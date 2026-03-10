import {
  type AiEmbeddingModel,
  type AiModel,
  OPENAI_TEXT_EMBEDDING_3_SMALL,
} from "@m5kdev/commons/modules/ai/ai.constants";
import { arrayToPseudoXML } from "@m5kdev/commons/modules/ai/ai.utils";
import type { Mastra } from "@mastra/core";
import { RequestContext } from "@mastra/core/request-context";
import type { FullOutput, MastraModelOutput } from "@mastra/core/stream";
import { MDocument } from "@mastra/rag";
import type { OpenRouterProvider } from "@openrouter/ai-sdk-provider";
import { embed, embedMany, generateObject, generateText } from "ai";
import { err, ok } from "neverthrow";
import type Replicate from "replicate";
import type { ZodType, z } from "zod";
import type { AiUsageRepository, AiUsageRow } from "#modules/ai/ai.repository";
import type {
  IdeogramV3GenerateInput,
  IdeogramV3GenerateOutput,
} from "#modules/ai/ideogram/ideogram.dto";
import type { IdeogramService } from "#modules/ai/ideogram/ideogram.service";
import type { User } from "#modules/auth/auth.lib";
import type { ServerResultAsync } from "#modules/base/base.dto";
import { BaseService } from "#modules/base/base.service";

type MastraAgent = ReturnType<Mastra["getAgent"]>;
type MastraAgentGenerateOptions = Parameters<MastraAgent["generate"]>[1];
type MessageListInput = { role: "user" | "assistant" | "system"; content: string }[];

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

  constructor(
    repositories: { aiUsage?: AiUsageRepository },
    services: { ideogram?: IdeogramService },
    libs: { mastra?: MastraInstance; openrouter?: OpenRouterProvider; replicate?: Replicate }
  ) {
    super(repositories, services);
    this.mastra = libs.mastra;
    this.openrouter = libs.openrouter;
    this.replicate = libs.replicate;
  }

  getMastra(): MastraInstance {
    if (!this.mastra) {
      throw new Error("Mastra is not available");
    }
    return this.mastra;
  }

  prepareModel(model: AiModel): any {
    if (!this.openrouter) {
      throw new Error("OpenRouter is not configured");
    }
    const openrouterModel = this.openrouter.chat(model);
    return openrouterModel;
  }

  prepareEmbeddingModel(model: AiEmbeddingModel): any {
    if (!this.openrouter) {
      throw new Error("OpenRouter is not configured");
    }
    const openrouterModel = this.openrouter.textEmbeddingModel(model);
    return openrouterModel;
  }

  async agentUse(
    agent: string,
    options: MastraAgentGenerateOptions & { prompt?: string; messages?: MessageListInput },
    ctx?: { user: User; model?: string }
  ): ServerResultAsync<Awaited<ReturnType<MastraModelOutput<any>["getFullOutput"]>>> {
    return this.throwableAsync(async () => {
      this.logger.info("AGENT USE");
      const { prompt, messages, ...rest } = options;
      const payload = messages || prompt;
      if (!payload) return this.error("BAD_REQUEST", "No prompt or messages provided");
      const requestContext = options.requestContext ?? new RequestContext();

      if (ctx?.user) {
        requestContext.set("userId", ctx.user.id);
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
          userId: ctx?.user?.id,
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
    ctx?: { user: User; model?: string }
  ): ServerResultAsync<string> {
    const result = await this.agentUse(agent, options, ctx);
    if (result.isErr())
      return this.error("SERVICE_UNAVAILABLE", "AI: Agent text failed", { cause: result.error });
    return ok(result.value.text);
  }

  async agentTextResult(
    agent: string,
    options: MastraAgentGenerateOptions & { prompt?: string; messages?: MessageListInput },
    ctx?: { user: User; model?: string }
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
    ctx?: { user: User; model?: string }
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
    ctx?: { user: User; model?: string }
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
    model: AiEmbeddingModel = OPENAI_TEXT_EMBEDDING_3_SMALL
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
    model: AiEmbeddingModel = OPENAI_TEXT_EMBEDDING_3_SMALL
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
    model: AiEmbeddingModel = OPENAI_TEXT_EMBEDDING_3_SMALL
  ): ServerResultAsync<{ embeddings: number[][] }> {
    return this.throwableAsync(async () => {
      const result = await embedMany({
        model: this.prepareEmbeddingModel(model),
        values: chunks.map((chunk) => chunk.text),
      });
      return ok(result);
    });
  }

  async generateText(
    params: Omit<Parameters<typeof generateText>[0], "model"> & {
      model: AiModel;
      removeMDash?: boolean;
    }
  ): ServerResultAsync<string> {
    return this.throwableAsync(async () => {
      const { removeMDash = true, model, ...rest } = params;
      const result = await generateText({ ...rest, model: this.prepareModel(model) });
      return ok(removeMDash ? result.text.replace(/\u2013|\u2014/g, "-") : result.text);
    });
  }

  async generateObject<T extends ZodType>(
    params: Omit<Parameters<typeof generateObject<T>>[0], "model" | "schema"> & {
      model: AiModel;
      schema: T;
    }
  ): ServerResultAsync<z.infer<T>> {
    return this.throwableAsync(async () => {
      const model = this.prepareModel(params.model);
      const result = await generateObject({
        ...params,
        model,
        schema: params.schema,
      });
      return ok(result.object as z.infer<T>);
    });
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
