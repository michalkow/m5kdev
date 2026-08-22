import { fetchS3DownloadUrl } from "./useS3DownloadUrl";

describe("fetchS3DownloadUrl", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches the download URL with credentials included", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://s3.example/object" }),
    });
    globalThis.fetch = fetchImpl as typeof fetch;

    const url = await fetchS3DownloadUrl("org/1/user/2/file.png", "http://server.test");

    expect(fetchImpl).toHaveBeenCalledWith("http://server.test/upload/files/org/1/user/2/file.png", {
      credentials: "include",
    });
    expect(url).toBe("https://s3.example/object");
  });
});
