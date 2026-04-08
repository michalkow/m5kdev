export interface InitiateS3UploadInput {
  readonly userId: string;
  readonly organizationId?: string;
  readonly teamId?: string;
  readonly contentType: string;
  readonly originalName: string;
  readonly sizeBytes?: number;
  readonly pathHint?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface FinalizeS3UploadInput {
  readonly userId: string;
  readonly fileId: string;
  readonly etag?: string;
}

/** When a DB `FileRepository` is wired, `fileId` is the inventory row id. Otherwise it is omitted. */
export interface InitiateS3UploadResult {
  readonly key: string;
  readonly url: string;
  readonly fileId?: string;
}
