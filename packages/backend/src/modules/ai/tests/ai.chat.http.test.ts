import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { handleChatStream } from "@mastra/ai-sdk";
import type { Mastra } from "@mastra/core";
import { pipeUIMessageStreamToResponse } from "ai";
import type { NextFunction, Response } from "express";
import express from "express";
import type { Session, User } from "../auth/auth.lib";
import type { AuthMiddleware, AuthRequest } from "../auth/auth.middleware";
import type { AiUsageRepository } from "./ai.repository";
import { createAiConversationRouter } from "./ai.router";
import { AIService } from "./ai.service";

jest.mock("@mastra/core/request-context", () => ({
  RequestContext: class {
    set = jest.fn();
  },
}));

jest.mock("@mastra/rag", () => ({
  MDocument: class {},
}));

jest.mock("@mastra/ai-sdk", () => ({
  handleChatStream: jest.fn(),
}));

jest.mock("ai", () => ({
  embed: jest.fn(),
  embedMany: jest.fn(),
  generateImage: jest.fn(),
  generateText: jest.fn(),
  pipeUIMessageStreamToResponse: jest.fn(),
  NoImageGeneratedError: class extends Error {
    static isInstance(): boolean {
      return false;
    }
  },
  NoObjectGeneratedError: class extends Error {
    static isInstance(): boolean {
      return false;
    }
  },
  Output: {
    array: jest.fn((params: unknown) => params),
    object: jest.fn((params: unknown) => params),
    text: jest.fn(() => ({ type: "text" })),
  },
}));

async function withServer(
  app: express.Express,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = await new Promise<Server>((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", () => {
      resolve(listening);
    });
    listening.on("error", reject);
  });

  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
}

function rejectAuth(): AuthMiddleware {
  return (_req: AuthRequest, res: Response) => {
    res.status(401).json({ message: "Unauthorized" });
  };
}

function acceptAuth(): AuthMiddleware {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    req.user = { id: "user-1", role: "user" } as User;
    req.session = { activeOrganizationId: null } as Session;
    next();
  };
}

function createMastra(agents: Record<string, { getMemory: () => unknown }>): Mastra {
  return {
    listAgents: () => agents,
    getAgent: (agentId: string) => {
      const agent = agents[agentId];
      if (!agent) throw new Error(`Agent ${agentId} not found`);
      return agent;
    },
  } as unknown as Mastra;
}

function mountApp(args: {
  authMiddleware: AuthMiddleware;
  mastra: Mastra;
  aiUsage?: Pick<AiUsageRepository, "create">;
}): express.Express {
  const service = new AIService(
    args.aiUsage ? { aiUsage: args.aiUsage as AiUsageRepository } : {},
    {},
    { mastra: args.mastra }
  );
  const app = express();
  app.use(express.json());
  app.use(
    "/ai",
    createAiConversationRouter({ authMiddleware: args.authMiddleware, aiService: service })
  );
  return app;
}

const userMessage = {
  id: "msg-1",
  role: "user",
  parts: [{ type: "text", text: "Hello" }],
};

function mockedHandleChatStream(): jest.Mock {
  return handleChatStream as unknown as jest.Mock;
}

function mockedPipe(): jest.Mock {
  return pipeUIMessageStreamToResponse as unknown as jest.Mock;
}

async function postChat(
  baseUrl: string,
  agentId: string,
  body: unknown
): Promise<globalThis.Response> {
  return fetch(`${baseUrl}/ai/chat/${agentId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Conversation hydrate HTTP", () => {
  it("rejects an unauthenticated hydrate with 401", async () => {
    const app = mountApp({
      authMiddleware: rejectAuth(),
      mastra: createMastra({
        writer: { getMemory: () => undefined },
      }),
    });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/ai/chat/writer/threads/thread-1`);
      expect(response.status).toBe(401);
    });
  });

  it("returns 404 when the Agent is unknown", async () => {
    const app = mountApp({
      authMiddleware: acceptAuth(),
      mastra: createMastra({
        writer: { getMemory: () => undefined },
      }),
    });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/ai/chat/missing/threads/thread-1`);
      expect(response.status).toBe(404);
    });
  });

  it("returns an empty transcript when the Agent has no Memory", async () => {
    const app = mountApp({
      authMiddleware: acceptAuth(),
      mastra: createMastra({
        writer: { getMemory: () => undefined },
      }),
    });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/ai/chat/writer/threads/thread-1`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ messages: [], memory: false });
    });
  });
});

describe("Conversation send HTTP", () => {
  beforeEach(() => {
    mockedHandleChatStream().mockReset();
    mockedPipe().mockReset();
  });

  it("rejects an unauthenticated send with 401", async () => {
    const app = mountApp({
      authMiddleware: rejectAuth(),
      mastra: createMastra({
        writer: { getMemory: () => undefined },
      }),
    });

    await withServer(app, async (baseUrl) => {
      const response = await postChat(baseUrl, "writer", { messages: [userMessage] });
      expect(response.status).toBe(401);
      expect(mockedHandleChatStream()).not.toHaveBeenCalled();
    });
  });

  it("returns 404 when the Agent is unknown", async () => {
    const app = mountApp({
      authMiddleware: acceptAuth(),
      mastra: createMastra({
        writer: { getMemory: () => undefined },
      }),
    });

    await withServer(app, async (baseUrl) => {
      const response = await postChat(baseUrl, "missing", { messages: [userMessage] });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ message: "Agent not found" });
      expect(mockedHandleChatStream()).not.toHaveBeenCalled();
    });
  });

  it("streams a v7 UIMessage protocol for a known Agent", async () => {
    const stream = new ReadableStream();
    mockedHandleChatStream().mockResolvedValue(stream);
    mockedPipe().mockImplementation(
      ({ response }: { response: { end: (body: string) => void } }) => {
        response.end("data: streamed\n\n");
      }
    );

    const app = mountApp({
      authMiddleware: acceptAuth(),
      mastra: createMastra({
        writer: { getMemory: () => undefined },
      }),
    });

    await withServer(app, async (baseUrl) => {
      const response = await postChat(baseUrl, "writer", {
        messages: [userMessage],
        threadId: "thread-1",
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("data: streamed\n\n");
    });

    expect(mockedHandleChatStream()).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "writer",
        version: "v7",
        params: expect.objectContaining({
          messages: [userMessage],
        }),
      })
    );
    expect(mockedPipe()).toHaveBeenCalledWith(
      expect.objectContaining({
        stream,
      })
    );
  });

  it("records ai_usage with feature equal to agentId when the stream finishes", async () => {
    const create = jest.fn().mockResolvedValue({});
    mockedHandleChatStream().mockImplementation(
      async (options: { defaultOptions?: { onFinish?: (result: unknown) => unknown } }) => {
        await options.defaultOptions?.onFinish?.({
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        });
        return new ReadableStream();
      }
    );
    mockedPipe().mockImplementation(
      ({ response }: { response: { end: (body: string) => void } }) => {
        response.end("data: streamed\n\n");
      }
    );

    const app = mountApp({
      authMiddleware: acceptAuth(),
      mastra: createMastra({
        writer: { getMemory: () => undefined },
      }),
      aiUsage: { create },
    });

    await withServer(app, async (baseUrl) => {
      const response = await postChat(baseUrl, "writer", { messages: [userMessage] });
      expect(response.status).toBe(200);
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "writer",
        userId: "user-1",
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      })
    );
  });

  it("does not attach Memory when the Agent has none", async () => {
    mockedHandleChatStream().mockResolvedValue(new ReadableStream());
    mockedPipe().mockImplementation(
      ({ response }: { response: { end: (body: string) => void } }) => {
        response.end("data: streamed\n\n");
      }
    );

    const app = mountApp({
      authMiddleware: acceptAuth(),
      mastra: createMastra({
        writer: { getMemory: () => undefined },
      }),
    });

    await withServer(app, async (baseUrl) => {
      await postChat(baseUrl, "writer", {
        messages: [userMessage],
        threadId: "thread-1",
      });
    });

    const options = mockedHandleChatStream().mock.calls[0]?.[0] as {
      params: { messages: unknown; memory?: unknown };
    };
    expect(options.params.messages).toEqual([userMessage]);
    expect(options.params.memory).toBeUndefined();
  });
});

describe("Conversation Memory HTTP", () => {
  beforeEach(() => {
    mockedHandleChatStream().mockReset();
    mockedPipe().mockReset();
  });

  it("recalls Thread messages for an Agent with Memory", async () => {
    const recall = jest.fn().mockResolvedValue({
      messages: [
        {
          id: "m1",
          role: "user",
          createdAt: new Date("2026-01-01"),
          content: { format: 2, parts: [{ type: "text", text: "Hi from memory" }] },
        },
      ],
    });

    const app = mountApp({
      authMiddleware: acceptAuth(),
      mastra: createMastra({
        writer: { getMemory: () => ({ recall }) },
      }),
    });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/ai/chat/writer/threads/thread-1`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        memory: true,
        messages: [
          {
            id: "m1",
            role: "user",
            parts: [{ type: "text", text: "Hi from memory" }],
          },
        ],
      });
    });

    expect(recall).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-1",
        resourceId: "user-1",
      })
    );
  });

  it("sends only the last user message and stamps memory.resource from the Actor", async () => {
    mockedHandleChatStream().mockResolvedValue(new ReadableStream());
    mockedPipe().mockImplementation(
      ({ response }: { response: { end: (body: string) => void } }) => {
        response.end("data: streamed\n\n");
      }
    );

    const earlier = {
      id: "msg-0",
      role: "assistant",
      parts: [{ type: "text", text: "Before" }],
    };
    const app = mountApp({
      authMiddleware: acceptAuth(),
      mastra: createMastra({
        writer: { getMemory: () => ({ recall: jest.fn() }) },
      }),
    });

    await withServer(app, async (baseUrl) => {
      const response = await postChat(baseUrl, "writer", {
        messages: [earlier, userMessage],
        memory: { thread: "thread-1", resource: "client-forged" },
      });
      expect(response.status).toBe(200);
    });

    expect(mockedHandleChatStream()).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          messages: [userMessage],
          memory: {
            thread: "thread-1",
            resource: "user-1",
          },
        }),
      })
    );
  });
});
