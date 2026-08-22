import fs from "node:fs";
import path from "node:path";
import { fileTypes } from "@m5kdev/commons/modules/file/file.constants";
import bodyParser from "body-parser";
import express, { type Request, type Response, type Router } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { captureServerError, ServerError } from "../../utils/errors";
import type { AuthMiddleware, AuthRequest } from "../auth/auth.middleware";
import { type AuthenticatedActor, createActorFromContext } from "../base/base.actor";
import type { FileService } from "./file.service";

/** Terminal capture for raw throws inside upload routes (no tRPC boundary here). */
function captureRouteError(err: unknown, context: Record<string, unknown>): void {
  captureServerError(
    ServerError.fromUnknown("INTERNAL_SERVER_ERROR", err, {
      layer: "controller",
      layerName: "FileRouter",
      context,
    })
  );
}

function validateMimeType(type: string, file: Express.Multer.File): boolean {
  return fileTypes[type]?.mimetypes.includes(file.mimetype);
}

function getFileExtension(file: Express.Multer.File): string | undefined {
  return file.originalname.split(".").pop();
}

/** Local upload filenames are uuid + optional safe extension — reject traversal. */
const SAFE_LOCAL_FILENAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\.[A-Za-z0-9_-]+)?$/i;

function localUploadsRoot(): string {
  return path.join(__dirname, "..", "uploads");
}

function createMulter(): multer.Multer {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      const destination = localUploadsRoot();
      fs.mkdirSync(destination, { recursive: true });
      cb(null, destination);
    },
    filename: (_req, file, cb) => {
      const extension = getFileExtension(file);
      const safeExt =
        extension && /^[A-Za-z0-9_-]+$/.test(extension) ? `.${extension.toLowerCase()}` : "";
      cb(null, `${uuidv4()}${safeExt}`);
    },
  });

  const fileFilter = (
    req: Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
  ): void => {
    const { type } = req.params;
    if (type && validateMimeType(type, file)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  };

  return multer({ storage, fileFilter });
}

export interface CreateUploadRouterOptions {
  readonly authMiddleware: AuthMiddleware;
  readonly fileService: FileService;
}

/**
 * Express routes for local disk uploads and S3 (presigned URLs, inventory-backed upload lifecycle).
 * Mount at `/upload` (or your chosen prefix).
 */
export function createUploadRouter({
  authMiddleware,
  fileService,
}: CreateUploadRouterOptions): Router {
  const upload = createMulter();
  const router: Router = express.Router();

  router.post(
    "/file/:type",
    authMiddleware,
    upload.single("file"),
    async (req: AuthRequest, res: Response) => {
      const { file } = req;
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const user = req.user;
      const session = req.session;
      if (!user || !session) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      let actor: AuthenticatedActor;
      try {
        actor = session.activeOrganizationId
          ? createActorFromContext({ user, session }, "organization")
          : createActorFromContext({ user, session }, "user");
      } catch (err: unknown) {
        captureRouteError(err, { route: "POST /file/:type" });
        const message = err instanceof Error ? err.message : "Forbidden";
        return res.status(403).json({ error: message });
      }
      const result = await fileService.recordLocalUpload(actor, {
        originalName: file.originalname,
        contentType: file.mimetype,
        sizeBytes: file.size,
        filename: file.filename,
      });
      if (result.isErr()) {
        const status =
          result.error.code === "FORBIDDEN"
            ? 403
            : result.error.code === "UNAUTHORIZED"
              ? 401
              : 500;
        return res.status(status).json({ error: result.error.message });
      }

      return res.json({
        url: `${process.env.VITE_SERVER_URL}/upload/file/${file.filename}`,
        mimetype: file.mimetype,
        size: file.size,
        fileId: result.value.fileId,
      });
    }
  );

  router.get("/file/:filename", (req: Request, res: Response) => {
    const filename = req.params.filename;
    if (!filename || !SAFE_LOCAL_FILENAME.test(filename)) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    return res.sendFile(filename, { root: localUploadsRoot() }, (error) => {
      if (error && !res.headersSent) {
        res.status(404).json({ error: "File not found" });
      }
    });
  });

  router.get("/files/:path(*)", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const key = req.params.path;
      if (!key) {
        return res.status(400).json({ error: "Missing path" });
      }
      const url = await fileService.getS3DownloadUrl(key);
      if (url.isErr()) {
        captureServerError(url.error); // no-op when already captured at creation
        return res.status(500).json({ error: url.error.message });
      }
      return res.json({ url: url.value });
    } catch (err: unknown) {
      captureRouteError(err, { route: "GET /files/:path" });
      const message = err instanceof Error ? err.message : "Failed to generate presigned URL";
      return res.status(500).json({ error: message });
    }
  });

  router.post(
    "/s3/initiate",
    authMiddleware,
    bodyParser.json(),
    async (req: AuthRequest, res: Response) => {
      const user = req.user;
      const session = req.session;
      if (!user || !session) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const userId = user.id;
      const { contentType, originalName, sizeBytes, pathHint, metadata } = req.body ?? {};
      // Never trust client-supplied organizationId/teamId — stamp from session only.
      const organizationId = session.activeOrganizationId ?? undefined;
      const teamId = session.activeTeamId ?? undefined;

      if (!contentType || !originalName) {
        return res.status(400).json({ error: "Missing contentType or originalName" });
      }

      let actor: AuthenticatedActor;
      try {
        actor = organizationId
          ? createActorFromContext({ user, session }, "organization")
          : createActorFromContext({ user, session }, "user");
      } catch (err: unknown) {
        captureRouteError(err, { route: "POST /s3/initiate" });
        const message = err instanceof Error ? err.message : "Forbidden";
        return res.status(403).json({ error: message });
      }
      const result = await fileService.initiateS3Upload(actor, {
        userId,
        memberId: session.activeOrganizationMemberId ?? undefined,
        organizationId,
        teamId,
        contentType,
        originalName,
        sizeBytes,
        pathHint,
        metadata,
      });
      if (result.isErr()) {
        return res.status(500).json({ error: result.error.message });
      }
      return res.json(result.value);
    }
  );

  router.post(
    "/s3/finalize",
    authMiddleware,
    bodyParser.json(),
    async (req: AuthRequest, res: Response) => {
      const user = req.user;
      const session = req.session;
      if (!user || !session) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const userId = user.id;
      const { fileId, etag } = req.body ?? {};
      if (!fileId) {
        return res.status(400).json({ error: "Missing fileId" });
      }

      const actor = createActorFromContext({ user, session }, "user");
      const result = await fileService.finalizeS3Upload(actor, { userId, fileId, etag });
      if (result.isErr()) {
        const status =
          result.error.code === "NOT_FOUND" ? 404 : result.error.code === "BAD_REQUEST" ? 400 : 500;
        return res.status(status).json({ error: result.error.message });
      }
      return res.json({ success: true });
    }
  );

  /** Deletes the inventory row and the S3 object. Authenticated owner only. */
  router.delete("/files/by-id/:fileId", authMiddleware, async (req: AuthRequest, res: Response) => {
    const user = req.user;
    const session = req.session;
    if (!user || !session) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { fileId } = req.params;
    if (!fileId) {
      return res.status(400).json({ error: "Missing fileId" });
    }

    const actor = createActorFromContext({ user, session }, "user");
    const result = await fileService.deleteUploadedFileById(actor, fileId);
    if (result.isErr()) {
      const status =
        result.error.code === "NOT_FOUND" ? 404 : result.error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: result.error.message });
    }
    return res.json({ success: true });
  });

  router.post(
    "/s3-presigned-url",
    authMiddleware,
    bodyParser.json(),
    async (req: AuthRequest, res: Response) => {
      const { filename, filetype } = req.body ?? {};

      if (!filename || !filetype) {
        return res.status(400).json({ error: "Missing filename or filetype" });
      }
      if (typeof filename !== "string" || filename.includes("..") || filename.startsWith("/")) {
        return res.status(400).json({ error: "Invalid filename" });
      }
      try {
        const url = await fileService.getS3UploadUrl(filename, filetype);
        if (url.isErr()) {
          return res.status(500).json({ error: url.error.message });
        }
        return res.json({ url: url.value });
      } catch (err: unknown) {
        captureRouteError(err, { route: "POST /s3-presigned-url" });
        const message = err instanceof Error ? err.message : "Failed to generate presigned URL";
        return res.status(500).json({ error: message });
      }
    }
  );

  router.delete("/files/:path(*)", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const key = req.params.path;
      if (!key) {
        return res.status(400).json({ error: "Missing path" });
      }
      const result = await fileService.deleteS3Object(key);
      if (result.isErr()) {
        captureServerError(result.error); // no-op when already captured at creation
        return res.status(500).json({ error: result.error.message });
      }
      return res.json({ success: true });
    } catch (err: unknown) {
      captureRouteError(err, { route: "DELETE /files/:path" });
      const message = err instanceof Error ? err.message : "Failed to delete S3 object";
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
