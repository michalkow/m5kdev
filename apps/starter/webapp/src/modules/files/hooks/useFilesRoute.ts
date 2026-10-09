import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { fileCookieDownloadUrl } from "@m5kdev/frontend/modules/file/hooks/useS3DownloadUrl";
import { useS3Upload } from "@m5kdev/frontend/modules/file/hooks/useS3Upload";
import type { AppRouter } from "@starter-app/server/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useTRPC } from "@/utils/trpc";

type FileListOutput = inferRouterOutputs<AppRouter>["file"]["list"];
type FileRow = FileListOutput["rows"][number];

interface FilesRouteRow extends FileRow {
  readonly downloadUrl: string;
}

interface FilesRouteState {
  readonly rows: FilesRouteRow[];
  readonly isLoading: boolean;
  readonly isFetching: boolean;
  readonly isUploading: boolean;
  readonly isDeleting: boolean;
  readonly upload: (file: File) => void;
  readonly remove: (fileId: string) => void;
}

export function useFilesRoute(): FilesRouteState {
  const { t } = useTranslation("starter-app");
  const { serverUrl } = useAppConfig();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const fileUpload = useS3Upload({ scope: "organization" });

  const listQuery = useQuery(trpc.file.list.queryOptions({}));

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      await fileUpload.upload(file);
    },
    onSuccess: async () => {
      toast.success(t("files.toast.uploaded"));
      await queryClient.invalidateQueries(trpc.file.list.queryFilter());
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("files.toast.failed"));
    },
  });

  const deleteMutation = useMutation(
    trpc.file.delete.mutationOptions({
      onSuccess: async () => {
        toast.success(t("files.toast.deleted"));
        await queryClient.invalidateQueries(trpc.file.list.queryFilter());
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : t("files.toast.deleteFailed"));
      },
    })
  );

  return {
    rows: (listQuery.data?.rows ?? []).map((row) => ({
      ...row,
      downloadUrl: fileCookieDownloadUrl(serverUrl, row.id),
    })),
    isLoading: listQuery.isLoading,
    isFetching: listQuery.isFetching,
    isUploading: uploadMutation.isPending,
    isDeleting: deleteMutation.isPending,
    upload: (file: File) => {
      void uploadMutation.mutateAsync(file).catch(() => undefined);
    },
    remove: (fileId: string) => {
      void deleteMutation.mutateAsync({ fileId }).catch(() => undefined);
    },
  };
}
