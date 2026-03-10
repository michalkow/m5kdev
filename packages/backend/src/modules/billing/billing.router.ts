import bodyParser from "body-parser";
import { Router } from "express";
import type { AuthMiddleware, AuthRequest } from "#modules/auth/auth.middleware";
import type { BillingService } from "#modules/billing/billing.service";

export function createBillingRouter(
  authMiddleware: AuthMiddleware,
  service: BillingService
): Router {
  const billingRouter = Router();

  billingRouter.get("/checkout/:priceId", authMiddleware, async (req: AuthRequest, res) => {
    const user = req.user!;

    const session = await service.createCheckoutSession({ priceId: req.params.priceId }, { user });
    if (session.isErr()) {
      return res.status(500).json({ message: session.error.message });
    }

    if (!session.value.url) {
      return res.status(500).json({ message: "Failed to create checkout session" });
    }

    return res.redirect(session.value.url);
  });

  billingRouter.get("/portal", authMiddleware, async (req: AuthRequest, res) => {
    const user = req.user!;

    const session = await service.createBillingPortalSession({ user });

    if (session.isErr()) {
      return res.status(500).json({ message: session.error.message });
    }

    return res.redirect(session.value.url);
  });

  billingRouter.get("/success", authMiddleware, async (req: AuthRequest, res) => {
    const user = req.user!;

    if (!user.stripeCustomerId) {
      return res.redirect(`${process.env.VITE_APP_URL}/billing`);
    }

    const result = await service.syncStripeData(user.stripeCustomerId);

    if (result.isErr()) {
      return res.redirect(`${process.env.VITE_APP_URL}/billing?error=SYNC_FAILED`);
    }

    return res.redirect(`${process.env.VITE_APP_URL}/billing`);
  });

  billingRouter.post("/webhook", bodyParser.raw({ type: "application/json" }), async (req, res) => {
    const signature = req.headers["stripe-signature"];

    if (!signature) return res.status(400).json({ message: "No signature" });

    if (typeof signature !== "string")
      return res.status(500).json({ message: "Signature is not a string" });

    const event = service.constructEvent(req.body, signature);
    if (event.isErr()) {
      return res.status(500).json({ message: event.error.message });
    }

    const result = await service.processEvent(event.value);
    if (result.isErr()) {
      return res.status(500).json({ message: result.error.message });
    }

    return res.status(200).json({ received: true });
  });

  return billingRouter;
}
