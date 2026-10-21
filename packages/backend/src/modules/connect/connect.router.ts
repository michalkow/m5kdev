import { Router } from "express";
import type { AuthMiddleware, AuthRequest } from "../auth/auth.middleware";
import type { ConnectService } from "./connect.service";

function queryString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function createConnectRouter(
  authMiddleware: AuthMiddleware,
  connectService: ConnectService
): Router {
  const connectRouter = Router();

  connectRouter.get("/:provider/start", authMiddleware, async (req: AuthRequest, res) => {
    const user = req.user;
    const session = req.session;
    if (!user || !session) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const provider = queryString(req.params.provider);
    const redirect = queryString(req.query.redirect);
    if (!provider) {
      return res.status(400).json({ message: "Missing provider" });
    }

    const result = await connectService.startAuth(user, session.id, provider);

    if (result.isErr()) {
      const errorUrl = redirect
        ? `${redirect}?error=${encodeURIComponent(result.error.message)}`
        : `${process.env.VITE_APP_URL || process.env.VITE_SERVER_URL || "/"}?connect_error=${encodeURIComponent(result.error.message)}`;
      return res.redirect(errorUrl);
    }

    return res.redirect(result.value.url);
  });

  connectRouter.get("/:provider/callback", authMiddleware, async (req: AuthRequest, res) => {
    const user = req.user;
    const session = req.session;
    if (!user || !session) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const provider = queryString(req.params.provider);
    const code = queryString(req.query.code);
    const state = queryString(req.query.state);
    const error = queryString(req.query.error);
    const errorDescription = queryString(req.query.error_description);
    const redirect = queryString(req.query.redirect);

    const successUrl =
      redirect ??
      `${process.env.VITE_APP_URL || process.env.VITE_SERVER_URL || "/"}?connect_success=true`;

    if (error) {
      const errorMessage = errorDescription || error;
      const errorUrl = `${successUrl}&error=${encodeURIComponent(errorMessage)}`;
      return res.redirect(errorUrl);
    }

    if (!provider || !code || !state) {
      const errorUrl = `${successUrl}&error=${encodeURIComponent("Missing code or state")}`;
      return res.redirect(errorUrl);
    }

    const result = await connectService.handleCallback(user, session.id, provider, code, state);

    if (result.isErr()) {
      const errorUrl = `${successUrl}&error=${encodeURIComponent(result.error.message)}`;
      return res.redirect(errorUrl);
    }

    return res.redirect(`${successUrl}&provider=${provider}`);
  });

  return connectRouter;
}
