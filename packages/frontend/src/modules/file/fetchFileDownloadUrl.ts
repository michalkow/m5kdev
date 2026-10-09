export interface FileDownloadUrlResult {
  readonly url: string;
  readonly expiresAt: Date;
}

export type FileDownloadLocator =
  | { readonly fileId: string }
  | { readonly bucket: string; readonly key: string };

export async function fetchFileDownloadUrl(input: {
  readonly query: (locator: FileDownloadLocator) => Promise<FileDownloadUrlResult>;
  readonly locator: FileDownloadLocator;
}): Promise<FileDownloadUrlResult> {
  return input.query(input.locator);
}
