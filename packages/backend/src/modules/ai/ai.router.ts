import type { Mastra } from "@mastra/core";
import { pipeUIMessageStreamToResponse, type UIMessage } from "ai";
import express, { type Response, type Router } from "express";
import { captureServerError, ServerError } from "../../utils/errors";
import type { AuthMiddleware, AuthRequest } from "../auth/auth.middleware";
import { createActorFromContext } from "../base/base.actor";
import type { ServerResult } from "../base/base.dto";
import type { AIService } from "./ai.service";

function captureRouteError(err: unknown, context: Record<string, unknown>): void {
  captureServerError(
    ServerError.fromUnknown("INTERNAL_SERVER_ERROR", err, {
      layer: "controller",
      layerName: "AiConversationRouter",
      context,
    })
  );
}

function resultStatus(result: ServerResult<unknown>): number {
  if (result.isOk()) return 200;
  return result.error.getHTTPStatusCode();
}

export interface CreateAiConversationRouterOptions {
  readonly authMiddleware: AuthMiddleware;
  readonly aiService: Pick<AIService<Mastra>, "recallThreadMessages" | "streamChat">;
}

export function createAiConversationRouter({
  authMiddleware,
  aiService,
}: CreateAiConversationRouterOptions): Router {
  const router: Router = express.Router();

  router.get(
    "/chat/:agentId/threads/:threadId",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      const user = req.user;
      const session = req.session;
      if (!user || !session) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const agentId = req.params.agentId;
      const threadId = req.params.threadId;
      if (!agentId || !threadId) {
        return res.status(400).json({ message: "Missing agentId or threadId" });
      }

      try {
        const actor = createActorFromContext({ user, session }, "user");
        const result = await aiService.recallThreadMessages({
          actor,
          agentId,
          threadId,
        });
        if (result.isErr()) {
          return res.status(resultStatus(result)).json({ message: result.error.message });
        }
        return res.json(result.value);
      } catch (err: unknown) {
        captureRouteError(err, { route: "GET /chat/:agentId/threads/:threadId" });
        const message = err instanceof Error ? err.message : "Internal Server Error";
        return res.status(500).json({ message });
      }
    }
  );

  router.post("/chat/:agentId", authMiddleware, async (req: AuthRequest, res: Response) => {
    const user = req.user;
    const session = req.session;
    if (!user || !session) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const agentId = req.params.agentId;
    if (!agentId) {
      return res.status(400).json({ message: "Missing agentId" });
    }

    const messages = readUiMessages(req.body);
    if (!messages) {
      return res.status(400).json({ message: "Missing messages" });
    }

    try {
      const actor = createActorFromContext({ user, session }, "user");
      const result = await aiService.streamChat({
        actor,
        agentId,
        messages,
      });
      if (result.isErr()) {
        return res.status(resultStatus(result)).json({ message: result.error.message });
      }
      pipeUIMessageStreamToResponse({
        response: res,
        stream: result.value,
      });
      return;
    } catch (err: unknown) {
      captureRouteError(err, { route: "POST /chat/:agentId" });
      const message = err instanceof Error ? err.message : "Internal Server Error";
      return res.status(500).json({ message });
    }
  });

  return router;
}

function readUiMessages(body: unknown): UIMessage[] | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  if (!("messages" in body) || !Array.isArray(body.messages)) return undefined;
  return body.messages;
}
