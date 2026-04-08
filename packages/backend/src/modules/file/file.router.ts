import path from "node:path";
import { fileTypes } from "@m5kdev/commons/modules/file/file.constants";
import bodyParser from "body-parser";
import express, { type Request, type Response, type Router } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import type { FileService } from "./file.service";

function validateMimeType(type: string, file: Express.Multer.File): boolean {
  return fileTypes[type]?.mimetypes.includes(file.mimetype);
}

function getFileExtension(file: Express.Multer.File): string | undefined {
  return file.originalname.split(".").pop();
}

function createMulter(): multer.Multer {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, path.join(__dirname, "..", "uploads"));
    },
    filename: (_req, file, cb) => {
      cb(null, `${uuidv4()}.${getFileExtension(file)}`);
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
  readonly fileService: FileService;
}

/**
 * Express routes for local disk uploads and S3 (presigned URLs, inventory-backed upload lifecycle).
 * Mount at `/upload` (or your chosen prefix).
 */
export function createUploadRouter({ fileService }: CreateUploadRouterOptions): Router {
  const upload = createMulter();
  const router: Router = express.Router();

  router.post("/file/:type", upload.single("file"), (req: Request, res: Response) => {
    const { file } = req;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    return res.json({
      url: `${process.env.VITE_SERVER_URL}/upload/file/${file.filename}`,
      mimetype: file.mimetype,
      size: file.size,
    });
  });

  router.get("/file/:filename", (req: Request, res: Response) => {
    const filename = req.params.filename;
    if (!filename) {
      return res.status(400).json({ error: "Missing filename" });
    }
    return res.sendFile(path.join(__dirname, "..", "uploads", filename));
  });

  router.get("/files/:path", async (req: Request, res: Response) => {
    try {
      const key = req.params.path;
      if (!key) {
        return res.status(400).json({ error: "Missing path" });
      }
      const url = await fileService.getS3DownloadUrl(key);
      if (url.isErr()) {
        console.error(url.error);
        return res.status(500).json({ error: url.error.message });
      }
      return res.json({ url: url.value });
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Failed to generate presigned URL";
      return res.status(500).json({ error: message });
    }
  });

  router.post("/s3/initiate", bodyParser.json(), async (req: Request, res: Response) => {
    const {
      userId,
      organizationId,
      teamId,
      contentType,
      originalName,
      sizeBytes,
      pathHint,
      metadata,
    } = req.body ?? {};

    if (!userId || !contentType || !originalName) {
      return res.status(400).json({ error: "Missing userId, contentType, or originalName" });
    }

    const result = await fileService.initiateS3Upload({
      userId,
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
  });

  router.post("/s3/finalize", bodyParser.json(), async (req: Request, res: Response) => {
    const { userId, fileId, etag } = req.body ?? {};
    if (!userId || !fileId) {
      return res.status(400).json({ error: "Missing userId or fileId" });
    }

    const result = await fileService.finalizeS3Upload({ userId, fileId, etag });
    if (result.isErr()) {
      const status =
        result.error.code === "NOT_FOUND" ? 404 : result.error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: result.error.message });
    }
    return res.json({ success: true });
  });

  /** Deletes the inventory row and the S3 object. Requires `userId` query (owner). */
  router.delete("/files/by-id/:fileId", async (req: Request, res: Response) => {
    const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    const { fileId } = req.params;
    if (!userId || !fileId) {
      return res.status(400).json({ error: "Missing userId query or fileId" });
    }

    const result = await fileService.deleteUploadedFileById(fileId, userId);
    if (result.isErr()) {
      const status =
        result.error.code === "NOT_FOUND" ? 404 : result.error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: result.error.message });
    }
    return res.json({ success: true });
  });

  router.post("/s3-presigned-url", bodyParser.json(), async (req: Request, res: Response) => {
    const { filename, filetype } = req.body;

    if (!filename || !filetype) {
      return res.status(400).json({ error: "Missing filename or filetype" });
    }
    try {
      const url = await fileService.getS3UploadUrl(filename, filetype);
      if (url.isErr()) {
        return res.status(500).json({ error: url.error.message });
      }
      return res.json({ url: url.value });
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Failed to generate presigned URL";
      return res.status(500).json({ error: message });
    }
  });

  router.delete("/files/:path(*)", async (req: Request, res: Response) => {
    try {
      const key = req.params.path;
      if (!key) {
        return res.status(400).json({ error: "Missing path" });
      }
      const result = await fileService.deleteS3Object(key);
      if (result.isErr()) {
        console.error(result.error);
        return res.status(500).json({ error: result.error.message });
      }
      return res.json({ success: true });
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Failed to delete S3 object";
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
