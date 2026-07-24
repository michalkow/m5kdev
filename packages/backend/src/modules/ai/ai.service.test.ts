import type { Mastra } from "@mastra/core";
import type { OpenRouterProvider } from "@openrouter/ai-sdk-provider";
import { NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { AIService, type AIServiceOptions } from "./ai.service";

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

function createService(options?: AIServiceOptions) {
  const chat = jest.fn((model: string) => ({ model }));
  const openrouter = { chat } as unknown as OpenRouterProvider;
  const service = new AIService<Mastra>({}, {}, { openrouter }, options);

  return { chat, service };
}

describe("AIService model failure cache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not demote a preferred text model after one failure", async () => {
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
    expect(chat.mock.calls[1]?.[0]).toBe("custom/preferred");
  });

  it("skips five fresh calls after the second failure, then probes and recovers", async () => {
    const { chat, service } = createService();
    mockGenerateText
      .mockRejectedValueOnce(new Error("first failure"))
      .mockRejectedValueOnce(new Error("second failure"))
      .mockResolvedValue(successfulTextResult);

    await service.generateText({
      preferredModels: ["custom/preferred"],
      prompt: "failure-1",
    });
    await service.generateText({
      preferredModels: ["custom/preferred"],
      prompt: "failure-2",
    });

    for (let run = 1; run <= 6; run += 1) {
      await service.generateText({
        preferredModels: ["custom/preferred"],
        prompt: `recovery-${run}`,
      });
    }
    await service.generateText({
      preferredModels: ["custom/preferred"],
      prompt: "after-recovery",
    });

    expect(chat.mock.calls[0]?.[0]).toBe("custom/preferred");
    expect(chat.mock.calls[1]?.[0]).toBe("custom/preferred");
    expect(chat.mock.calls.slice(2, 7).every(([model]) => model !== "custom/preferred")).toBe(true);
    expect(chat.mock.calls[7]?.[0]).toBe("custom/preferred");
    expect(chat.mock.calls[8]?.[0]).toBe("custom/preferred");
  });

  it("exponentially increases probe intervals up to the configured cap", async () => {
    const { chat, service } = createService({
      modelFailureThreshold: 2,
      modelFailureInitialSkipRuns: 1,
      modelFailureMaxSkipRuns: 4,
    });
    const preferredRuns = new Set([1, 2, 4, 7, 12, 17]);

    for (let run = 1; run <= 17; run += 1) {
      if (preferredRuns.has(run)) {
        mockGenerateText.mockRejectedValueOnce(new Error(`failure-${run}`));
      } else {
        mockGenerateText.mockResolvedValueOnce(successfulTextResult);
      }
    }

    for (let run = 1; run <= 17; run += 1) {
      await service.generateText({
        preferredModels: ["custom/preferred"],
        prompt: `run-${run}`,
      });
    }

    const actualPreferredRuns = chat.mock.calls.flatMap(([model], index) =>
      model === "custom/preferred" ? [index + 1] : []
    );
    expect(actualPreferredRuns).toEqual([...preferredRuns]);
  });

  it("keeps object and text failure histories independent", async () => {
    const { chat, service } = createService();
    mockGenerateText
      .mockRejectedValueOnce(new Error("first text failure"))
      .mockRejectedValueOnce(new Error("second text failure"))
      .mockResolvedValueOnce(successfulObjectResult);

    await service.generateText({
      preferredModels: ["custom/preferred"],
      prompt: "text-1",
    });
    await service.generateText({
      preferredModels: ["custom/preferred"],
      prompt: "text-2",
    });
    const objectResult = await service.generateObject({
      preferredModels: ["custom/preferred"],
      prompt: "object",
      schema: z.object({ value: z.string() }),
    });

    expect(objectResult.isOk()).toBe(true);
    expect(chat.mock.calls[2]?.[0]).toBe("custom/preferred");
  });

  it("deprioritizes a preferred model after two unusable object outputs", async () => {
    const { chat, service } = createService();
    mockGenerateText
      .mockRejectedValueOnce(createNoObjectGeneratedError('{"value":123}'))
      .mockRejectedValueOnce(createNoObjectGeneratedError('{"value":456}'))
      .mockResolvedValueOnce(successfulObjectResult);

    const firstFailure = await service.generateObject({
      preferredModels: ["custom/preferred"],
      prompt: "first",
      schema: z.object({ value: z.string() }),
    });
    const secondFailure = await service.generateObject({
      preferredModels: ["custom/preferred"],
      prompt: "second",
      schema: z.object({ value: z.string() }),
    });
    await service.generateObject({
      preferredModels: ["custom/preferred"],
      prompt: "third",
      schema: z.object({ value: z.string() }),
    });

    expect(firstFailure.isErr()).toBe(true);
    expect(secondFailure.isErr()).toBe(true);
    expect(chat.mock.calls[0]?.[0]).toBe("custom/preferred");
    expect(chat.mock.calls[1]?.[0]).toBe("custom/preferred");
    expect(chat.mock.calls[2]?.[0]).not.toBe("custom/preferred");
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

  it("does not advance recovery counters during retries", async () => {
    const { chat, service } = createService({
      modelFailureThreshold: 1,
      modelFailureInitialSkipRuns: 2,
      modelFailureMaxSkipRuns: 2,
    });
    mockGenerateText
      .mockRejectedValueOnce(new Error("preferred failed"))
      .mockResolvedValue(successfulTextResult);

    await service.generateText({
      preferredModels: ["custom/preferred"],
      prompt: "initial",
      retryAttempts: 1,
    });
    for (let run = 2; run <= 4; run += 1) {
      await service.generateText({
        preferredModels: ["custom/preferred"],
        prompt: `fresh-${run}`,
      });
    }

    expect(chat.mock.calls[0]?.[0]).toBe("custom/preferred");
    expect(chat.mock.calls[1]?.[0]).not.toBe("custom/preferred");
    expect(chat.mock.calls[2]?.[0]).not.toBe("custom/preferred");
    expect(chat.mock.calls[3]?.[0]).not.toBe("custom/preferred");
    expect(chat.mock.calls[4]?.[0]).toBe("custom/preferred");
  });

  it("isolates failure caches between service instances", async () => {
    const options = {
      modelFailureThreshold: 1,
      modelFailureInitialSkipRuns: 5,
      modelFailureMaxSkipRuns: 5,
    };
    const first = createService(options);
    const second = createService(options);
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
