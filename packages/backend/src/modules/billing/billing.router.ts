import bodyParser from "body-parser";
import { Router } from "express";
import type { AuthMiddleware, AuthRequest } from "../auth/auth.middleware";
import type { BillingService } from "./billing.service";

function organizationFields(req: AuthRequest): {
  organizationId: string;
  memberId: string;
  organizationRole: string;
  email: string;
  name?: string;
} | null {
  const user = req.user;
  const session = req.session;
  if (!user || !session?.activeOrganizationId || !session.activeOrganizationMemberId) {
    return null;
  }
  return {
    organizationId: session.activeOrganizationId,
    memberId: session.activeOrganizationMemberId,
    organizationRole: session.activeOrganizationRole ?? "",
    email: user.email,
    name: user.name,
  };
}

export function createBillingRouter(
  authMiddleware: AuthMiddleware,
  service: BillingService
): Router {
  const billingRouter = Router();

  billingRouter.get("/checkout/:priceId", authMiddleware, async (req: AuthRequest, res) => {
    const fields = organizationFields(req);
    if (!fields) {
      return res.status(403).json({ message: "Organization is required" });
    }

    const session = await service.createCheckoutSession({ priceId: req.params.priceId }, fields);
    if (session.isErr()) {
      const status =
        session.error.code === "FORBIDDEN"
          ? 403
          : session.error.code === "CONFLICT"
            ? 409
            : 500;
      return res.status(status).json({ message: session.error.message });
    }

    if (!session.value.url) {
      return res.status(500).json({ message: "Failed to create checkout session" });
    }

    return res.redirect(session.value.url);
  });

  billingRouter.get("/portal", authMiddleware, async (req: AuthRequest, res) => {
    const fields = organizationFields(req);
    if (!fields) {
      return res.status(403).json({ message: "Organization is required" });
    }

    const portal = await service.createBillingPortalSession(fields);

    if (portal.isErr()) {
      const status = portal.error.code === "FORBIDDEN" ? 403 : 500;
      return res.status(status).json({ message: portal.error.message });
    }

    return res.redirect(portal.value.url);
  });

  billingRouter.get("/success", authMiddleware, async (req: AuthRequest, res) => {
    const fields = organizationFields(req);
    if (!fields) {
      return res.redirect(`${process.env.VITE_APP_URL}/billing`);
    }

    const result = await service.syncOrganizationSubscription(fields.organizationId);

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
