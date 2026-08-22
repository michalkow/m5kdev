import { getPresignedUrl } from "./useS3Upload";

describe("getPresignedUrl", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("requests a presigned URL with credentials included", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://s3.example/upload" }),
    });
    globalThis.fetch = fetchImpl as typeof fetch;

    const url = await getPresignedUrl("file.png", "image/png", "http://server.test");

    expect(fetchImpl).toHaveBeenCalledWith("http://server.test/upload/s3-presigned-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ filename: "file.png", filetype: "image/png" }),
    });
    expect(url).toBe("https://s3.example/upload");
  });
});
