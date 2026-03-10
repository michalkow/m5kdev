import { Router } from "express";
import type { AuthMiddleware, AuthRequest } from "#modules/auth/auth.middleware";
import type { ConnectService } from "./connect.service";

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
    const { provider } = req.params;
    const { redirect } = req.query;

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
    const { provider } = req.params;
    const { code, state, error, error_description } = req.query;
    const { redirect } = req.query;

    const successUrl =
      redirect && typeof redirect === "string"
        ? redirect
        : `${process.env.VITE_APP_URL || process.env.VITE_SERVER_URL || "/"}?connect_success=true`;

    // Handle OAuth errors from provider
    if (error) {
      const errorMessage = error_description || error || "OAuth error";
      const errorUrl = `${successUrl}&error=${encodeURIComponent(String(errorMessage))}`;
      return res.redirect(errorUrl);
    }

    if (!code || !state) {
      const errorUrl = `${successUrl}&error=${encodeURIComponent("Missing code or state")}`;
      return res.redirect(errorUrl);
    }

    const result = await connectService.handleCallback(
      user,
      session.id,
      provider,
      String(code),
      String(state)
    );

    if (result.isErr()) {
      const errorUrl = `${successUrl}&error=${encodeURIComponent(result.error.message)}`;
      return res.redirect(errorUrl);
    }

    return res.redirect(`${successUrl}&provider=${provider}`);
  });

  return connectRouter;
}
