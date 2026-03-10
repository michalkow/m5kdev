import { useQuery } from "@tanstack/react-query";

export async function fetchS3DownloadUrl(
  filePath: string,
  serverUrl = import.meta.env.VITE_SERVER_URL
) {
  const res = await fetch(`${serverUrl}/upload/files/${filePath}`);
  if (!res.ok) throw new Error("Failed to get download URL");
  return (await res.json()).url as string;
}

export function useS3DownloadUrl(filePath: string, serverUrl = import.meta.env.VITE_SERVER_URL) {
  return useQuery<string, Error>({
    queryKey: ["s3DownloadUrl", filePath],
    queryFn: () => fetchS3DownloadUrl(filePath, serverUrl),
    enabled: Boolean(filePath),
  });
}
