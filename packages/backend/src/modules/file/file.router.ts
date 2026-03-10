import path from "node:path";
import { fileTypes } from "@m5kdev/commons/modules/file/file.constants";
import bodyParser from "body-parser";
import express, { type Request, type Response } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { FileRepository } from "#modules/file/file.repository";
import { FileService } from "#modules/file/file.service";

const fileRepository = new FileRepository();
const fileService = new FileService({ file: fileRepository });

function validateMimeType(type: string, file: Express.Multer.File): boolean {
  return fileTypes[type]?.mimetypes.includes(file.mimetype);
}

function getFileExtension(file: Express.Multer.File): string | undefined {
  return file.originalname.split(".").pop();
}

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

const upload = multer({ storage, fileFilter });
const uploadRouter: express.Router = express.Router();

uploadRouter.post("/file/:type", upload.single("file"), (req: Request, res: Response) => {
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

uploadRouter.get("/file/:filename", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "..", "uploads", req.params.filename!));
});

uploadRouter.get("/files/:path", async (req: Request, res: Response) => {
  try {
    const url = await fileService.getS3DownloadUrl(req.params.path!);
    if (url.isErr()) {
      console.error(url.error);
      return res.status(500).json({ error: url.error.message });
    }
    return res.json({ url: url.value });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Failed to generate presigned URL" });
  }
});

uploadRouter.post("/s3-presigned-url", bodyParser.json(), async (req: Request, res: Response) => {
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
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Failed to generate presigned URL" });
  }
});

uploadRouter.delete("/files/:path(*)", async (req: Request, res: Response) => {
  try {
    const result = await fileService.deleteS3Object(req.params.path!);
    if (result.isErr()) {
      console.error(result.error);
      return res.status(500).json({ error: result.error.message });
    }
    return res.json({ success: true });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Failed to delete S3 object" });
  }
});

export { uploadRouter };
