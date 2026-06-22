import { useCallback, useState } from "react";
import { useAppConfig } from "../../app/hooks/useAppConfig";

export type S3UploadStatus = "idle" | "uploading" | "success" | "error";

export type UploadBlobInput =
  | Blob
  | {
      uri: string;
      name?: string;
      type?: string;
      size?: number;
    };

export type ResolvedUploadBlob = {
  blob: Blob;
  name: string;
  type: string;
  size: number;
};

async function getPresignedUrl(
  filename: string,
  filetype: string,
  serverUrl: string
): Promise<string> {
  const res = await fetch(`${serverUrl}/upload/s3-presigned-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, filetype }),
  });
  if (!res.ok) throw new Error("Failed to get presigned URL");
  const data = (await res.json()) as { url: string };
  return data.url;
}

function isBlobInput(file: UploadBlobInput): file is Blob {
  return typeof Blob !== "undefined" && file instanceof Blob;
}

function getInputName(file: UploadBlobInput) {
  if (!isBlobInput(file)) {
    return file.name ?? `upload-${Date.now()}`;
  }

  return "name" in file && typeof file.name === "string" ? file.name : `upload-${Date.now()}`;
}

function getInputType(file: UploadBlobInput, blob: Blob) {
  if (!isBlobInput(file)) {
    return file.type ?? blob.type ?? "application/octet-stream";
  }

  return file.type || "application/octet-stream";
}

export async function resolveUploadBlob(file: UploadBlobInput): Promise<ResolvedUploadBlob> {
  const blob = isBlobInput(file) ? file : await fetch(file.uri).then((response) => response.blob());
  return {
    blob,
    name: getInputName(file),
    type: getInputType(file, blob),
    size: "size" in file && typeof file.size === "number" ? file.size : blob.size,
  };
}

function createUploadId() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 11);
}

export function useS3Upload(serverUrlOverride?: string) {
  const { serverUrl } = useAppConfig();
  const resolvedServerUrl = serverUrlOverride ?? serverUrl;
  const [progress, setProgress] = useState<number>(0);
  const [status, setStatus] = useState<S3UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  const upload = useCallback(
    async (file: UploadBlobInput, prefix?: string) => {
      setProgress(0);
      setStatus("uploading");
      setError(null);
      setUploadedUrl(null);
      try {
        const resolvedFile = await resolveUploadBlob(file);
        const originalFilename = resolvedFile.name;
        const extension = originalFilename.split(".").pop() || "";
        const uuid = createUploadId();
        const filename = prefix
          ? `${prefix}/${uuid}${extension ? `.${extension}` : ""}`
          : `${uuid}${extension ? `.${extension}` : ""}`;
        const filetype = resolvedFile.type;
        const presignedUrl = await getPresignedUrl(filename, filetype, resolvedServerUrl);

        return await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", presignedUrl);
          xhr.setRequestHeader("Content-Type", filetype);

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              setProgress(Math.round((event.loaded * 100) / event.total));
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              setProgress(100);
              setStatus("success");
              // Remove query params to get the public URL
              setUploadedUrl(presignedUrl.split("?")[0]);
              resolve(filename);
            } else {
              setStatus("error");
              setError(`Upload failed with status ${xhr.status}`);
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          };

          xhr.onerror = () => {
            setStatus("error");
            setError("Network error during upload");
            reject(new Error("Network error during upload"));
          };

          xhr.send(resolvedFile.blob);
        });
      } catch (err: unknown) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unknown error");
        return Promise.reject(err);
      }
    },
    [resolvedServerUrl]
  );

  const reset = useCallback(() => {
    setProgress(0);
    setStatus("idle");
    setError(null);
    setUploadedUrl(null);
  }, []);

  return { upload, progress, status, error, uploadedUrl, reset };
}
