import express, { Router } from "express";
import type { AuthMiddleware, AuthRequest } from "../auth/auth.middleware";
import { checkoutReturnInputSchema, checkoutStartInputSchema } from "./billing.checkout";
import { portalReturnInputSchema, portalStartInputSchema } from "./billing.portal";
import type { BillingService } from "./billing.service";

export function createBillingRouter(
  authMiddleware: AuthMiddleware,
  service: BillingService
): Router {
  const billingRouter = Router();

  billingRouter.get("/checkout/:priceId", authMiddleware, async (req: AuthRequest, res) => {
    const priceId = typeof req.params.priceId === "string" ? req.params.priceId : undefined;
    if (!priceId) {
      return res.status(400).json({ message: "Missing priceId" });
    }
    const input = checkoutStartInputSchema.safeParse({ priceId, returnPath: req.query.returnPath });
    if (!input.success) return res.status(400).json({ message: "Invalid Checkout request" });
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const session = await service.startCheckout(input.data, {
      user: req.user,
      session: req.session,
      experience: req.experience,
      req,
    });
    if (session.isErr()) {
      const status = session.error.getHTTPStatusCode();
      return res.status(status).json({ message: session.error.message });
    }

    return res.redirect(session.value.url);
  });

  billingRouter.get("/portal", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const input = portalStartInputSchema.safeParse(req.query);
    if (!input.success) return res.status(400).json({ message: "Invalid Portal request" });
    const portal = await service.startPortal(input.data, {
      user: req.user,
      session: req.session,
      experience: req.experience,
      req,
    });
    if (portal.isErr())
      return res.status(portal.error.getHTTPStatusCode()).json({ message: portal.error.message });
    return res.redirect(portal.value.url);
  });

  billingRouter.get("/portal/return", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const input = portalReturnInputSchema.safeParse(req.query);
    if (!input.success)
      return res
        .status(400)
        .json({ message: "Invalid billing link. Reopen Billing from the original website." });
    const result = await service.completePortal(input.data, {
      user: req.user,
      session: req.session,
      experience: req.experience,
      req,
    });
    if (result.isErr())
      return res.status(result.error.getHTTPStatusCode()).json({ message: result.error.message });
    return res.redirect(result.value.url);
  });

  for (const kind of ["success", "cancel"] as const)
    billingRouter.get(`/${kind}`, authMiddleware, async (req: AuthRequest, res) => {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const input = checkoutReturnInputSchema.safeParse(req.query);
      if (!input.success)
        return res
          .status(400)
          .json({ message: "Invalid billing link. Reopen Billing from the original website." });
      const result = await service.completeCheckout(
        { ...input.data, kind },
        {
          user: req.user,
          session: req.session,
          experience: req.experience,
          req,
        }
      );
      if (result.isErr())
        return res.status(result.error.getHTTPStatusCode()).json({ message: result.error.message });
      return res.redirect(result.value.url);
    });

  billingRouter.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
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
