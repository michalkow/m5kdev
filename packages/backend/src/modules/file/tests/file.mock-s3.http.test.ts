import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express, { type Express } from "express";
import { LocalFileObjectStore } from "../file.local-store";
import { createMockS3Router } from "../file.mock-s3.router";
import { FILE_S3_MOCK_MOUNT } from "../file.object-store";

async function withServer(app: Express, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = await new Promise<Server>((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", () => {
      resolve(listening);
    });
    listening.on("error", reject);
  });

  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
}

describe("File S3 mock HTTP", () => {
  let root: string;
  let store: LocalFileObjectStore;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "m5kdev-file-s3-http-"));
    store = new LocalFileObjectStore({
      root,
      publicBaseUrl: "http://localhost:3000",
      defaultBucket: "app-bucket",
    });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("PUT and GET a nested object key", async () => {
    const app = express();
    app.use(FILE_S3_MOCK_MOUNT, createMockS3Router(store));

    await withServer(app, async (baseUrl) => {
      const url = `${baseUrl}${FILE_S3_MOCK_MOUNT}/app-bucket/folder/a.png`;
      const put = await fetch(url, {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: Buffer.from("png-bytes"),
      });
      expect(put.status).toBe(200);

      const get = await fetch(url);
      expect(get.status).toBe(200);
      expect(await get.text()).toBe("png-bytes");
      expect(get.headers.get("content-type")).toMatch(/image\/png/);
    });
  });
});
