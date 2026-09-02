import bodyParser from "body-parser";
import { type Request, Router } from "express";
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

  webhookRouter.post("/:id", bodyParser.json(), async (req, res) => {
    const token = presentedToken(req);
    if (!token) return res.status(401).json({ message: "Missing token" });

    const result = await webhookService.receive({
      id: req.params.id,
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
