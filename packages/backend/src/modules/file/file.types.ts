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
