import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalFileObjectStore } from "../file.local-store";

describe("LocalFileObjectStore", () => {
  let root: string;
  let store: LocalFileObjectStore;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "m5kdev-file-s3-"));
    store = new LocalFileObjectStore({
      root,
      publicBaseUrl: "http://localhost:3000",
      defaultBucket: "app-bucket",
    });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("stores and retrieves an object without AWS", async () => {
    const put = await store.putS3Object("notes.txt", Buffer.from("hello"), "text/plain");
    expect(put.isOk()).toBe(true);

    const got = await store.getS3Object("notes.txt");
    expect(got.isOk()).toBe(true);
    if (got.isErr()) return;
    expect(got.value.body.toString("utf8")).toBe("hello");
    expect(got.value.contentType).toBe("text/plain");
  });

  it("issues upload URLs that point at the mock S3 HTTP path", async () => {
    const url = await store.getS3UploadUrl("folder/a.png", "image/png");
    expect(url.isOk()).toBe(true);
    if (url.isErr()) return;
    expect(url.value).toBe("http://localhost:3000/file-s3-mock/app-bucket/folder/a.png");
  });

  it("does not require AWS credentials to construct", () => {
    expect(store.getBucket()).toBe("app-bucket");
  });
});
