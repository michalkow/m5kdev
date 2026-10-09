export interface PutFileProgressEvent {
  readonly loaded: number;
  readonly total: number;
}

export interface PutFileToPresignedUrlInput {
  readonly url: string;
  readonly body: Blob;
  readonly contentType: string;
  readonly onProgress?: (progress: number, event: PutFileProgressEvent) => void;
}

/**
 * PUT bytes to a presigned (or mock S3) URL. Progress is reported from XHR upload events.
 */
export function putFileToPresignedUrl(input: PutFileToPresignedUrlInput): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", input.url);
    xhr.setRequestHeader("Content-Type", input.contentType);

    xhr.upload.onprogress = (event: ProgressEvent<EventTarget>) => {
      if (!event.lengthComputable) return;
      const progress = Math.round((event.loaded * 100) / event.total);
      input.onProgress?.(progress, { loaded: event.loaded, total: event.total });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        input.onProgress?.(100, { loaded: input.body.size, total: input.body.size });
        resolve();
        return;
      }
      reject(new Error(`Upload failed with status ${xhr.status}`));
    };

    xhr.onerror = () => {
      reject(new Error("Network error during upload"));
    };

    xhr.send(input.body);
  });
}
