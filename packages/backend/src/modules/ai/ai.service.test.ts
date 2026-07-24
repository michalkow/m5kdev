import type { Mastra } from "@mastra/core";
import type { OpenRouterProvider } from "@openrouter/ai-sdk-provider";
import { NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { AIService } from "./ai.service";

const mockGenerateText = jest.fn();

jest.mock("@mastra/core/request-context", () => ({
  RequestContext: class {
    set = jest.fn();
  },
}));

jest.mock("@mastra/rag", () => ({
  MDocument: class {},
}));

jest.mock("ai", () => {
  class MockNoObjectGeneratedError extends Error {
    text?: string;
    usage?: unknown;
    override cause?: unknown;

    constructor(params: { message?: string; text?: string; usage?: unknown; cause?: unknown }) {
      super(params.message ?? "No object generated.");
      this.text = params.text;
      this.usage = params.usage;
      this.cause = params.cause;
    }

    static isInstance(error: unknown): error is MockNoObjectGeneratedError {
      return error instanceof MockNoObjectGeneratedError;
    }
  }

  class MockNoImageGeneratedError extends Error {
    static isInstance(error: unknown): error is MockNoImageGeneratedError {
      return error instanceof MockNoImageGeneratedError;
    }
  }

  return {
    embed: jest.fn(),
    embedMany: jest.fn(),
    generateImage: jest.fn(),
    generateText: (...args: unknown[]) => mockGenerateText(...args),
    NoImageGeneratedError: MockNoImageGeneratedError,
    NoObjectGeneratedError: MockNoObjectGeneratedError,
    Output: {
      array: jest.fn((params: unknown) => params),
      object: jest.fn((params: unknown) => params),
      text: jest.fn(() => ({ type: "text" })),
    },
  };
});

const successfulTextResult = {
  output: "generated text",
  text: "generated text",
  usage: {},
};

const successfulObjectResult = {
  output: { value: "generated object" },
  text: '{"value":"generated object"}',
  usage: {},
};

function createNoObjectGeneratedError(text?: string): NoObjectGeneratedError {
  return new NoObjectGeneratedError({
    text,
    response: {
      id: "response-id",
      timestamp: new Date(),
      modelId: "model-id",
    },
    usage: {
      inputTokens: 1,
      inputTokenDetails: {
        noCacheTokens: 1,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      outputTokens: 1,
      outputTokenDetails: {
        textTokens: 1,
        reasoningTokens: 0,
      },
      totalTokens: 2,
    },
    finishReason: "stop",
  });
}

function createService() {
  const chat = jest.fn((model: string) => ({ model }));
  const openrouter = { chat } as unknown as OpenRouterProvider;
  const service = new AIService<Mastra>({}, {}, { openrouter });

  return { chat, service };
}

describe("AIService model failure cache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deprioritizes a failed preferred text model on the next run", async () => {
    const { chat, service } = createService();
    mockGenerateText
      .mockRejectedValueOnce(new Error("provider failed"))
      .mockResolvedValueOnce(successfulTextResult);

    const failed = await service.generateText({
      preferredModels: ["custom/preferred"],
      prompt: "first",
    });
    const succeeded = await service.generateText({
      preferredModels: ["custom/preferred"],
      prompt: "second",
    });

    expect(failed.isErr()).toBe(true);
    expect(succeeded.isOk()).toBe(true);
    expect(chat.mock.calls[0]?.[0]).toBe("custom/preferred");
    expect(chat.mock.calls[1]?.[0]).not.toBe("custom/preferred");
  });

  it("keeps object and text failure histories independent", async () => {
    const { chat, service } = createService();
    mockGenerateText
      .mockRejectedValueOnce(new Error("text provider failed"))
      .mockResolvedValueOnce(successfulObjectResult);

    await service.generateText({
      preferredModels: ["custom/preferred"],
      prompt: "text",
    });
    const objectResult = await service.generateObject({
      preferredModels: ["custom/preferred"],
      prompt: "object",
      schema: z.object({ value: z.string() }),
    });

    expect(objectResult.isOk()).toBe(true);
    expect(chat.mock.calls[1]?.[0]).toBe("custom/preferred");
  });

  it("deprioritizes a preferred model after unusable object output", async () => {
    const { chat, service } = createService();
    mockGenerateText
      .mockRejectedValueOnce(createNoObjectGeneratedError('{"value":123}'))
      .mockResolvedValueOnce(successfulObjectResult);

    const failed = await service.generateObject({
      preferredModels: ["custom/preferred"],
      prompt: "first",
      schema: z.object({ value: z.string() }),
    });
    await service.generateObject({
      preferredModels: ["custom/preferred"],
      prompt: "second",
      schema: z.object({ value: z.string() }),
    });

    expect(failed.isErr()).toBe(true);
    expect(chat.mock.calls[0]?.[0]).toBe("custom/preferred");
    expect(chat.mock.calls[1]?.[0]).not.toBe("custom/preferred");
  });

  it("does not penalize object output recovered by local JSON repair", async () => {
    const { chat, service } = createService();
    mockGenerateText
      .mockRejectedValueOnce(createNoObjectGeneratedError('{"value":"recovered"}'))
      .mockResolvedValueOnce(successfulObjectResult);

    const recovered = await service.generateObject({
      preferredModels: ["custom/preferred"],
      prompt: "first",
      schema: z.object({ value: z.string() }),
    });
    await service.generateObject({
      preferredModels: ["custom/preferred"],
      prompt: "second",
      schema: z.object({ value: z.string() }),
    });

    expect(recovered.isOk()).toBe(true);
    expect(chat.mock.calls[0]?.[0]).toBe("custom/preferred");
    expect(chat.mock.calls[1]?.[0]).toBe("custom/preferred");
  });

  it("isolates failure caches between service instances", async () => {
    const first = createService();
    const second = createService();
    mockGenerateText
      .mockRejectedValueOnce(new Error("provider failed"))
      .mockResolvedValueOnce(successfulTextResult);

    await first.service.generateText({
      preferredModels: ["custom/preferred"],
      prompt: "first",
    });
    await second.service.generateText({
      preferredModels: ["custom/preferred"],
      prompt: "second",
    });

    expect(first.chat.mock.calls[0]?.[0]).toBe("custom/preferred");
    expect(second.chat.mock.calls[0]?.[0]).toBe("custom/preferred");
  });
});
