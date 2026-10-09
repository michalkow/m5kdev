/** Presigned GET lifetime in seconds for `GET /files/:id` and `getDownloadUrl`. */
export const FILE_DOWNLOAD_EXPIRES_IN = 60 * 5;

/** Stale PENDING Files older than this are FAILED and have any S3 object deleted. Not configurable. */
export const FILE_PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export const FILE_PURGE_CRON_NAME = "file.purge";
export const FILE_PURGE_CRON_PATTERN = "0 0 * * *";
