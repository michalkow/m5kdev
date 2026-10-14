import express, { type Request, Router } from "express";
import type { WebhookService } from "./webhook.service";

function presentedToken(req: Request): string | undefined {
  const { authorization } = req.headers;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length);
    return token || undefined;
  }
  const queryToken = req.query.token;
  return typeof queryToken === "string" && queryToken ? queryToken : undefined;
}

export function createWebhookRouter(webhookService: WebhookService): Router {
  const webhookRouter = Router();

  webhookRouter.post("/:id", express.json(), async (req, res) => {
    const token = presentedToken(req);
    if (!token) return res.status(401).json({ message: "Missing token" });

    const id = typeof req.params.id === "string" ? req.params.id : undefined;
    if (!id) return res.status(400).json({ message: "Missing inbound callback id" });

    const result = await webhookService.receive({
      id,
      token,
      payload: req.body,
    });
    if (result.isErr())
      return res
        .status(result.error.getHTTPStatusCode() || 500)
        .json({ message: result.error.message });
    return res.status(200).json({ message: "Webhook completed" });
  });

  return webhookRouter;
}
