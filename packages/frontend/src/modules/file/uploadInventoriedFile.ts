import { putFileToPresignedUrl } from "./putFileToPresignedUrl";

export type ResolvedUploadBlob = {
  blob: Blob;
  name: string;
  type: string;
  size: number;
};

export interface InitiateFileUploadInput {
  readonly contentType: string;
  readonly originalName: string;
  readonly sizeBytes: number;
}

export interface InitiateFileUploadResult {
  readonly fileId: string;
  readonly url: string;
}

export interface UploadInventoriedFileInput {
  readonly file: ResolvedUploadBlob;
  readonly initiate: (input: InitiateFileUploadInput) => Promise<InitiateFileUploadResult>;
  readonly finalize: (input: { fileId: string }) => Promise<void>;
  readonly onProgress?: (progress: number) => void;
}

/**
 * Production upload: Grant-checked initiate → PUT bytes to S3 → finalize.
 * Returns the File id. Does not POST bytes to the app server.
 */
export async function uploadInventoriedFile(
  input: UploadInventoriedFileInput
): Promise<{ fileId: string }> {
  const initiated = await input.initiate({
    contentType: input.file.type,
    originalName: input.file.name,
    sizeBytes: input.file.size,
  });
  await putFileToPresignedUrl(initiated.url, input.file.blob, input.file.type, (progress) => {
    input.onProgress?.(progress);
  });
  await input.finalize({ fileId: initiated.fileId });
  return { fileId: initiated.fileId };
}
