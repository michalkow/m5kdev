import { useCallback, useState } from "react";
import { useAppConfig } from "../../app/hooks/useAppConfig";

export type S3UploadStatus = "idle" | "uploading" | "success" | "error";

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

export function useS3Upload(serverUrlOverride?: string) {
  const { serverUrl } = useAppConfig();
  const resolvedServerUrl = serverUrlOverride ?? serverUrl;
  const [progress, setProgress] = useState<number>(0);
  const [status, setStatus] = useState<S3UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File | Blob, prefix?: string) => {
      setProgress(0);
      setStatus("uploading");
      setError(null);
      setUploadedUrl(null);
      try {
        const originalFilename = file instanceof File ? file.name : `upload-${Date.now()}`;
        const extension = originalFilename.split(".").pop() || "";
        const uuid = crypto.randomUUID();
        const filename = prefix ? `${prefix}/${uuid}.${extension}` : `${uuid}.${extension}`;
        const filetype = file instanceof File ? file.type : "application/octet-stream";
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

          xhr.send(file);
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
