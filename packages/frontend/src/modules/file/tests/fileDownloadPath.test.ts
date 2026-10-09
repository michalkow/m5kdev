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
