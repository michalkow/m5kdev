import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Mastra } from "@mastra/core";
import type { NextFunction, Response } from "express";
import express from "express";
import type { Session, User } from "../auth/auth.lib";
import type { AuthMiddleware, AuthRequest } from "../auth/auth.middleware";
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

jest.mock("ai", () => ({
  embed: jest.fn(),
  embedMany: jest.fn(),
  generateImage: jest.fn(),
  generateText: jest.fn(),
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

function mountApp(args: { authMiddleware: AuthMiddleware; mastra: Mastra }): express.Express {
  const service = new AIService({}, {}, { mastra: args.mastra });
  const app = express();
  app.use("/ai", createAiConversationRouter({ authMiddleware: args.authMiddleware, aiService: service }));
  return app;
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
