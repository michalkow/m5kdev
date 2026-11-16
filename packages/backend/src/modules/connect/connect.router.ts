import { Router } from "express";
import type { AuthMiddleware, AuthRequest } from "../auth/auth.middleware";
import { connectCallbackInputSchema, connectStartInputSchema } from "./connect.dto";
import type { ConnectService } from "./connect.service";

export function createConnectRouter(
  authMiddleware: AuthMiddleware,
  service: ConnectService
): Router {
  const router = Router();
  router.get("/:provider/start", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user || !req.session) return res.status(401).json({ message: "Unauthorized" });
    const input = connectStartInputSchema.safeParse({
      provider: req.params.provider,
      redirect: req.query.redirect,
    });
    if (!input.success) return res.status(400).json({ message: "Invalid connection request" });
    const result = await service.startAuth(input.data, {
      user: req.user,
      sessionId: req.session.id,
      experience: req.experience,
      request: req,
    });
    if (result.isErr())
      return res.status(result.error.getHTTPStatusCode()).json({ message: result.error.message });
    return res.redirect(result.value.url);
  });
  router.get("/:provider/callback", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user || !req.session) return res.status(401).json({ message: "Unauthorized" });
    const input = connectCallbackInputSchema.safeParse({
      ...req.query,
      provider: req.params.provider,
    });
    if (!input.success) return res.status(400).json({ message: "Invalid connection callback" });
    const result = await service.handleCallback(input.data, {
      user: req.user,
      sessionId: req.session.id,
      experience: req.experience,
      request: req,
    });
    if (result.isErr())
      return res.status(result.error.getHTTPStatusCode()).json({ message: result.error.message });
    return res.redirect(result.value.url);
  });
  return router;
}
