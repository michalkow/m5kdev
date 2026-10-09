export interface PutFileProgressEvent {
  readonly loaded: number;
  readonly total: number;
}

/**
 * PUT bytes to a presigned (or mock S3) URL. Progress is reported from XHR upload events.
 */
export function putFileToPresignedUrl(
  url: string,
  body: Blob,
  contentType: string,
  onProgress?: (progress: number, event: PutFileProgressEvent) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (event: ProgressEvent<EventTarget>) => {
      if (!event.lengthComputable) return;
      const progress = Math.round((event.loaded * 100) / event.total);
      onProgress?.(progress, { loaded: event.loaded, total: event.total });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100, { loaded: body.size, total: body.size });
        resolve();
        return;
      }
      reject(new Error(`Upload failed with status ${xhr.status}`));
    };

    xhr.onerror = () => {
      reject(new Error("Network error during upload"));
    };

    xhr.send(body);
  });
}
