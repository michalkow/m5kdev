import express, { type Response, type Router } from "express";
import type { MembershipLookup } from "../base/base.actor";
import type { AuthMiddleware, AuthRequest } from "../auth/auth.middleware";
import type { FileService } from "./file.service";

export interface CreateDownloadRouterOptions {
  readonly authMiddleware: AuthMiddleware;
  readonly fileService: FileService;
  readonly memberships: MembershipLookup;
}

export function createDownloadRouter({
  authMiddleware,
  fileService,
  memberships,
}: CreateDownloadRouterOptions): Router {
  const router: Router = express.Router();

  router.get("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const fileId = req.params.id;
    if (!fileId) {
      return res.status(400).json({ error: "Missing file id" });
    }

    const result = await fileService.downloadById(fileId, {
      userId: user.id,
      userRole: user.role ?? "user",
      memberships,
    });
    if (result.isErr()) {
      const status =
        result.error.code === "NOT_FOUND"
          ? 404
          : result.error.code === "FORBIDDEN" || result.error.code === "UNAUTHORIZED"
            ? result.error.code === "UNAUTHORIZED"
              ? 401
              : 403
            : 500;
      return res.status(status).json({ error: result.error.message });
    }
    return res.redirect(302, result.value.url);
  });

  return router;
}
