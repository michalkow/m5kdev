export interface RecordLocalUploadInput {
  readonly originalName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly filename: string;
}

export interface RecordLocalUploadResult {
  readonly fileId?: string;
  readonly originalName: string;
}

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

export type FileLocator = { readonly fileId: string } | { readonly bucket: string; readonly key: string };
