export interface PutFileObjectInput {
  readonly body: Buffer;
  readonly contentType: string;
  readonly originalName: string;
  readonly userId?: string;
  readonly memberId?: string;
  readonly organizationId?: string;
  readonly sizeBytes?: number;
  readonly pathHint?: string;
  readonly metadata?: Record<string, unknown>;
  readonly bucket?: string;
}

export type FileLocator =
  | { readonly fileId: string }
  | { readonly bucket: string; readonly key: string };

export interface FileTypeAllowlist {
  readonly mimetypes: readonly string[];
  readonly extensions?: readonly string[];
}

export function toFileLocator(input: {
  readonly fileId?: string;
  readonly bucket?: string;
  readonly key?: string;
}): FileLocator | undefined {
  const hasId = Boolean(input.fileId);
  const hasBucketKey = Boolean(input.bucket && input.key);
  if (hasId === hasBucketKey) {
    return undefined;
  }
  if (input.fileId) {
    return { fileId: input.fileId };
  }
  return { bucket: input.bucket ?? "", key: input.key ?? "" };
}
