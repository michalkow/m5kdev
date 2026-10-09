import { useCallback, useState } from "react";
import { useAppTRPCClient } from "../../app/hooks/useAppTrpc";
import {
  type InitiateFileUploadInput,
  type InitiateFileUploadResult,
  type ResolvedUploadBlob,
  uploadInventoriedFile,
} from "../uploadInventoriedFile";

export type S3UploadStatus = "idle" | "uploading" | "success" | "error";
export type FileUploadScope = "organization" | "user";

export type UploadBlobInput =
  | Blob
  | {
      uri: string;
      name?: string;
      type?: string;
      size?: number;
    };

export type { ResolvedUploadBlob };

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

interface FileUploadProcedures {
  initiate: {
    mutate: (input: InitiateFileUploadInput) => Promise<InitiateFileUploadResult>;
  };
  finalize: {
    mutate: (input: { fileId: string }) => Promise<void>;
  };
}

interface FileUploadRouter {
  file: FileUploadProcedures & { user: FileUploadProcedures };
}

export interface UseS3UploadOptions {
  readonly scope?: FileUploadScope;
}

/**
 * Production File upload: initiate → PUT (progress) → finalize.
 * Returns the File id. Does not POST multipart bytes to the app server.
 */
export function useS3Upload(options: UseS3UploadOptions = {}) {
  const client = useAppTRPCClient() as unknown as FileUploadRouter;
  const scope = options.scope ?? "organization";
  const [progress, setProgress] = useState<number>(0);
  const [status, setStatus] = useState<S3UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);

  const upload = useCallback(
    async (file: UploadBlobInput) => {
      setProgress(0);
      setStatus("uploading");
      setError(null);
      setFileId(null);
      try {
        const resolvedFile = await resolveUploadBlob(file);
        const procedures = scope === "user" ? client.file.user : client.file;
        const result = await uploadInventoriedFile({
          file: resolvedFile,
          initiate: (input) => procedures.initiate.mutate(input),
          finalize: (input) => procedures.finalize.mutate(input),
          onProgress: setProgress,
        });
        setProgress(100);
        setStatus("success");
        setFileId(result.fileId);
        return result.fileId;
      } catch (err: unknown) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unknown error");
        return Promise.reject(err);
      }
    },
    [client, scope]
  );

  const reset = useCallback(() => {
    setProgress(0);
    setStatus("idle");
    setError(null);
    setFileId(null);
  }, []);

  return { upload, progress, status, error, fileId, reset };
}
