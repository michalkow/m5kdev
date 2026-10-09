/** Inventory `bucket` for files stored on local disk via `POST /upload/file/:type`. */
export const LOCAL_FILE_BUCKET = "local";

/** Presigned GET lifetime in seconds for `GET /files/:id` and `getDownloadUrl`. */
export const FILE_DOWNLOAD_EXPIRES_IN = 60 * 5;
