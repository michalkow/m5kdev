import { useAppConfig } from "../../app/hooks/useAppConfig";
import { fileCookieDownloadPath, fileCookieDownloadUrl } from "../fileDownloadPath";

export { fileCookieDownloadPath, fileCookieDownloadUrl };

/**
 * Cookie download URL for an inventoried File id. HTTP(S) values (OAuth avatars)
 * pass through unchanged.
 */
export function fileDisplayUrl(serverUrl: string, stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith("http://") || stored.startsWith("https://")) {
    return stored;
  }
  return fileCookieDownloadUrl(serverUrl, stored);
}

export function useS3DownloadUrl(fileIdOrUrl: string, serverUrlOverride?: string) {
  const { serverUrl } = useAppConfig();
  const resolvedServerUrl = serverUrlOverride ?? serverUrl;
  const data = fileDisplayUrl(resolvedServerUrl, fileIdOrUrl || null);
  return { data };
}
