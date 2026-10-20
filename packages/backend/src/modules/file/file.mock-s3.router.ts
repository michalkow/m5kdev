import express, { type Request, type Response, type Router } from "express";
import { FILE_S3_MOCK_MOUNT } from "./file.object-store";
import type { LocalFileObjectStore } from "./file.local-store";

function splatPath(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (Array.isArray(value) && value.length > 0 && value.every((part) => typeof part === "string")) {
    return value.join("/");
  }
  return undefined;
}

function objectLocator(req: Request): { bucket: string; key: string } | undefined {
  const bucket = req.params.bucket;
  const key = splatPath(req.params.key);
  if (typeof bucket !== "string" || !key) {
    return undefined;
  }
  return { bucket: decodeURIComponent(bucket), key: key.split("/").map(decodeURIComponent).join("/") };
}

export function createMockS3Router(store: LocalFileObjectStore): Router {
  const router = express.Router();

  router.put("/:bucket/{*key}", express.raw({ type: "*/*", limit: "50mb" }), async (req: Request, res: Response) => {
    const locator = objectLocator(req);
    if (!locator) {
      return res.status(400).json({ error: "Missing bucket or key" });
    }
    const contentType = req.header("content-type") ?? "application/octet-stream";
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? []);
    const put = await store.putS3Object(locator.key, body, contentType, locator.bucket);
    if (put.isErr()) {
      return res.status(500).json({ error: put.error.message });
    }
    return res.status(200).end();
  });

  router.get("/:bucket/{*key}", async (req: Request, res: Response) => {
    const locator = objectLocator(req);
    if (!locator) {
      return res.status(400).json({ error: "Missing bucket or key" });
    }
    const got = await store.getS3Object(locator.key, locator.bucket);
    if (got.isErr()) {
      return res.status(404).json({ error: "Not found" });
    }
    if (got.value.contentType) {
      res.setHeader("Content-Type", got.value.contentType);
    }
    return res.status(200).send(got.value.body);
  });

  return router;
}

export { FILE_S3_MOCK_MOUNT };
