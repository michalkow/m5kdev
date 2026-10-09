import { uploadInventoriedFile } from "../uploadInventoriedFile";

class FakeXHR {
  status = 200;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  opened: { method: string; url: string } | undefined;
  headers: Record<string, string> = {};
  sent: Blob | null = null;

  open(method: string, url: string): void {
    this.opened = { method, url };
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  send(body: Blob): void {
    this.sent = body;
    this.upload.onprogress?.({
      lengthComputable: true,
      loaded: 40,
      total: 80,
    } as ProgressEvent);
    this.onload?.();
  }
}

describe("uploadInventoriedFile", () => {
  const originalXHR = globalThis.XMLHttpRequest;
  let xhr: FakeXHR;

  beforeEach(() => {
    xhr = new FakeXHR();
    globalThis.XMLHttpRequest = jest.fn(() => xhr) as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    globalThis.XMLHttpRequest = originalXHR;
  });

  it("initiates, PUTs bytes to the presigned URL, then finalizes", async () => {
    const initiate = jest.fn(async () => ({
      fileId: "file-1",
      url: "http://s3.test/put",
    }));
    const finalize = jest.fn(async () => undefined);
    const progress: number[] = [];
    const blob = new Blob(["hello"], { type: "image/png" });

    const result = await uploadInventoriedFile({
      file: { blob, name: "hello.png", type: "image/png", size: 5 },
      initiate,
      finalize,
      onProgress: (value) => {
        progress.push(value);
      },
    });

    expect(initiate).toHaveBeenCalledWith({
      contentType: "image/png",
      originalName: "hello.png",
      sizeBytes: 5,
    });
    expect(xhr.opened).toEqual({ method: "PUT", url: "http://s3.test/put" });
    expect(xhr.headers["Content-Type"]).toBe("image/png");
    expect(xhr.sent).toBe(blob);
    expect(finalize).toHaveBeenCalledWith({ fileId: "file-1" });
    expect(result).toEqual({ fileId: "file-1" });
    expect(progress).toContain(50);
    expect(progress).toContain(100);
  });

  it("does not finalize when the PUT fails", async () => {
    xhr.status = 403;
    const finalize = jest.fn(async () => undefined);

    await expect(
      uploadInventoriedFile({
        file: {
          blob: new Blob(["x"], { type: "image/png" }),
          name: "x.png",
          type: "image/png",
          size: 1,
        },
        initiate: async () => ({ fileId: "file-2", url: "http://s3.test/put" }),
        finalize,
      })
    ).rejects.toThrow("Upload failed with status 403");
    expect(finalize).not.toHaveBeenCalled();
  });
});
