import { useCallback } from "react";
import { useAppTRPCClient } from "../../app/hooks/useAppTrpc";
import {
  type FileDownloadLocator,
  type FileDownloadUrlResult,
  fetchFileDownloadUrl,
} from "../fetchFileDownloadUrl";
import type { FileUploadScope } from "./useS3Upload";

export type { FileDownloadLocator, FileDownloadUrlResult };

interface FileDownloadProcedures {
  getDownloadUrl: {
    query: (locator: FileDownloadLocator) => Promise<FileDownloadUrlResult>;
  };
}

interface FileDownloadRouter {
  file: FileDownloadProcedures & { user: FileDownloadProcedures };
}

export interface UseFileDownloadUrlOptions {
  readonly scope?: FileUploadScope;
}

/**
 * Cookieless download: Grant-checked tRPC `getDownloadUrl` (presigned URL).
 */
export function useFileDownloadUrl(options: UseFileDownloadUrlOptions = {}) {
  const client = useAppTRPCClient() as unknown as FileDownloadRouter;
  const scope = options.scope ?? "organization";

  const getUrl = useCallback(
    async (locator: FileDownloadLocator): Promise<FileDownloadUrlResult> => {
      const procedures = scope === "user" ? client.file.user : client.file;
      return fetchFileDownloadUrl({
        query: (input) => procedures.getDownloadUrl.query(input),
        locator,
      });
    },
    [client, scope]
  );

  return { getUrl };
}
