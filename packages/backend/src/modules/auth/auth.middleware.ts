import { fromNodeHeaders } from "better-auth/node";
import type { InferSelectModel } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { captureServerError, ServerError } from "../../utils/errors";
import { runWithPosthogRequestState } from "../../utils/posthog";
import { runWithActorTelemetry } from "../../utils/telemetry";
import * as auth from "./auth.db";
import type { BetterAuth } from "./auth.lib";

/** getSession rejected (auth backend/DB down) — without capture every request silently 500s. */
function captureSessionFailure(error: unknown): void {
  captureServerError(
    ServerError.fromUnknown("INTERNAL_SERVER_ERROR", error, {
      layer: "auth",
      layerName: "AuthMiddleware",
    })
  );
}

const { users, sessions } = auth;

type User = InferSelectModel<typeof users>;
type Session = InferSelectModel<typeof sessions>;

export type AuthRequest = Request & { user?: User; session?: Session };

export type AuthMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => void;

export function createAuthMiddleware(auth: BetterAuth): AuthMiddleware {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    auth.api
      .getSession({
        headers: fromNodeHeaders(req.headers),
      })
      .then((data) => {
        if (!data?.user || !data?.session) {
          res.status(401).json({ message: "Unauthorized" });
        } else {
          req.user = data.user as User;
          req.session = data.session as Session;
          runWithActorTelemetry(
            {
              userId: req.user.id,
              organizationId: req.session.activeOrganizationId ?? undefined,
            },
            () =>
              runWithPosthogRequestState(
                { disableCapture: Boolean(req.session?.impersonatedBy) },
                () => next()
              )
          );
        }
      })
      .catch((error) => {
        captureSessionFailure(error);
        res.status(500).json({ message: "Unable to authenticate" });
      });
  };
}

export function createRoleAuthMiddleware(auth: BetterAuth): (role: string) => AuthMiddleware {
  return (role: string) => (req: AuthRequest, res: Response, next: NextFunction) => {
    auth.api
      .getSession({
        headers: fromNodeHeaders(req?.headers),
      })
      .then((data) => {
        const user = (data?.user as User) || null;
        if (!data?.session || user?.role !== role) {
          res.status(401).json({ message: "Unauthorized" });
        } else {
          req.user = user;
          req.session = data?.session as Session;
          runWithActorTelemetry(
            {
              userId: req.user.id,
              organizationId: req.session.activeOrganizationId ?? undefined,
            },
            () =>
              runWithPosthogRequestState(
                { disableCapture: Boolean(req.session?.impersonatedBy) },
                () => next()
              )
          );
        }
      })
      .catch((error) => {
        captureSessionFailure(error);
        res.status(500).json({ message: "Unable to authenticate" });
      });
  };
}
