import { useFileUpload } from "@m5kdev/frontend/modules/file/hooks/useUpload";
import type { AppRouter } from "@starter-app/server/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useTRPC } from "@/utils/trpc";

type FileListOutput = inferRouterOutputs<AppRouter>["file"]["list"];
type FileRow = FileListOutput["rows"][number];

interface FilesRouteState {
  readonly rows: FileRow[];
  readonly isLoading: boolean;
  readonly isFetching: boolean;
  readonly isUploading: boolean;
  readonly upload: (file: File) => void;
}

export function useFilesRoute(): FilesRouteState {
  const { t } = useTranslation("starter-app");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const fileUpload = useFileUpload();

  const listQuery = useQuery(trpc.file.list.queryOptions({}));

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      await fileUpload.upload("image", file);
    },
    onSuccess: async () => {
      toast.success(t("files.toast.uploaded"));
      await queryClient.invalidateQueries(trpc.file.list.queryFilter());
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("files.toast.failed"));
    },
  });

  return {
    rows: listQuery.data?.rows ?? [],
    isLoading: listQuery.isLoading,
    isFetching: listQuery.isFetching,
    isUploading: uploadMutation.isPending,
    upload: (file: File) => {
      void uploadMutation.mutateAsync(file).catch(() => undefined);
    },
  };
}
