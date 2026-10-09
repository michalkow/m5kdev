import { fetchFileDownloadUrl } from "../fetchFileDownloadUrl";
import { fileCookieDownloadPath, fileCookieDownloadUrl } from "../fileDownloadPath";
import { fileDisplayUrl } from "../hooks/useS3DownloadUrl";

describe("fileCookieDownloadPath", () => {
  it("builds /files/:id from a File id", () => {
    expect(fileCookieDownloadPath("file-abc")).toBe("/files/file-abc");
  });

  it("joins the API origin without storing a presigned URL", () => {
    expect(fileCookieDownloadUrl("http://127.0.0.1:8080/", "file-abc")).toBe(
      "http://127.0.0.1:8080/files/file-abc"
    );
  });
});

describe("fileDisplayUrl", () => {
  it("keeps http(s) OAuth avatars as-is", () => {
    expect(fileDisplayUrl("http://api.test", "https://cdn.example/me.png")).toBe(
      "https://cdn.example/me.png"
    );
  });

  it("treats a stored File id as /files/:id", () => {
    expect(fileDisplayUrl("http://api.test", "file-abc")).toBe("http://api.test/files/file-abc");
  });
});

describe("fetchFileDownloadUrl", () => {
  it("queries getDownloadUrl with the File locator", async () => {
    const query = jest.fn(async () => ({
      url: "https://s3.test/presigned",
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
    }));

    const result = await fetchFileDownloadUrl({
      query,
      locator: { fileId: "file-abc" },
    });

    expect(query).toHaveBeenCalledWith({ fileId: "file-abc" });
    expect(result.url).toBe("https://s3.test/presigned");
  });
});
