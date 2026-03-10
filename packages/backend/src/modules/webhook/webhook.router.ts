import bodyParser from "body-parser";
import { Router } from "express";
import type { WebhookService } from "./webhook.service";

export function createWebhookRouter(webhookService: WebhookService): Router {
  const webhookRouter = Router();

  webhookRouter.post("/:id", bodyParser.json(), async (req, res) => {
    const { authorization } = req.headers;
    if (!authorization) return res.status(401).json({ message: "Missing authorization header" });
    if (typeof authorization !== "string")
      return res.status(401).json({ message: "Authorization header is not a string" });
    if (!authorization.startsWith("Bearer "))
      return res.status(401).json({ message: "Invalid authorization header" });
    const token = authorization.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Missing token" });
    if (token !== process.env.WEBHOOK_SECRET)
      return res.status(401).json({ message: "Invalid token" });

    const result = await webhookService.completed(req.params.id, req.body);
    if (result.isErr())
      return res
        .status(result.error.getHTTPStatusCode() || 500)
        .json({ message: result.error.message });
    return res.status(200).json({ message: "Webhook completed" });
  });

  return webhookRouter;
}
