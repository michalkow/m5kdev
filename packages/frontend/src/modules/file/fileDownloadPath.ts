/** Cookie-session download path. Clients construct this from File id; do not store it. */
export function fileCookieDownloadPath(fileId: string): string {
  return `/files/${fileId}`;
}

export function fileCookieDownloadUrl(serverUrl: string, fileId: string): string {
  return `${serverUrl.replace(/\/$/, "")}${fileCookieDownloadPath(fileId)}`;
}
