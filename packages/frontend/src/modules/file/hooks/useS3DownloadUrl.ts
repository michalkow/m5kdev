import { useQuery } from "@tanstack/react-query";
import { useAppConfig } from "../../app/hooks/useAppConfig";

export async function fetchS3DownloadUrl(filePath: string, serverUrl?: string) {
  if (!serverUrl) {
    throw new Error("fetchS3DownloadUrl requires a serverUrl. In React, use useS3DownloadUrl.");
  }

  const res = await fetch(`${serverUrl}/upload/files/${filePath}`);
  if (!res.ok) throw new Error("Failed to get download URL");
  return (await res.json()).url as string;
}

export function useS3DownloadUrl(filePath: string, serverUrlOverride?: string) {
  const { serverUrl } = useAppConfig();
  const resolvedServerUrl = serverUrlOverride ?? serverUrl;

  return useQuery<string, Error>({
    queryKey: ["s3DownloadUrl", resolvedServerUrl, filePath],
    queryFn: () => fetchS3DownloadUrl(filePath, resolvedServerUrl),
    enabled: Boolean(filePath),
  });
}
