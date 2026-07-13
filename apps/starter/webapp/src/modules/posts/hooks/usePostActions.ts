import { useDialog } from "@m5kdev/web-ui/components/DialogProvider";
import type {
  PostCreateInputSchema,
  PostPublishInputSchema,
  PostSoftDeleteInputSchema,
  PostUpdateInputSchema,
} from "@starter-app/shared/modules/posts/posts.schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useTRPC } from "@/utils/trpc";

/**
 * Reusable post mutations: save (create/update), publish, and delete with a
 * confirmation dialog. Toasts and list invalidation live here so any component
 * can trigger the same action with the same behavior.
 */
export function usePostActions() {
  const { t } = useTranslation("starter-app");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const showDialog = useDialog();

  const invalidateList = async () => {
    await queryClient.invalidateQueries(trpc.posts.list.queryFilter());
  };

  const onError = (error: unknown) => {
    toast.error(error instanceof Error ? error.message : String(error));
  };

  const createMutation = useMutation(
    trpc.posts.create.mutationOptions({
      onSuccess: async () => {
        toast.success(t("posts.toast.created"));
        await invalidateList();
      },
      onError,
    })
  );

  const updateMutation = useMutation(
    trpc.posts.update.mutationOptions({
      onSuccess: async () => {
        toast.success(t("posts.toast.updated"));
        await invalidateList();
      },
      onError,
    })
  );

  const publishMutation = useMutation(
    trpc.posts.publish.mutationOptions({
      onSuccess: async () => {
        toast.success(t("posts.toast.published"));
        await invalidateList();
      },
      onError,
    })
  );

  const deleteMutation = useMutation(
    trpc.posts.softDelete.mutationOptions({
      onSuccess: async () => {
        toast.success(t("posts.toast.deleted"));
        await invalidateList();
      },
      onError,
    })
  );

  /** Create when `id` is missing, update otherwise. Resolves false on failure (toast already shown). */
  const savePost = async (payload: PostCreateInputSchema, id?: string): Promise<boolean> => {
    try {
      if (id) {
        await updateMutation.mutateAsync({ id, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      return true;
    } catch {
      return false;
    }
  };

  const publishPost = (id: string) => {
    void publishMutation
      .mutateAsync({ id } satisfies PostPublishInputSchema)
      .catch(() => undefined);
  };

  const deletePost = (id: string) => {
    showDialog({
      title: t("posts.deleteDialog.title"),
      description: t("posts.deleteDialog.body"),
      intent: "danger",
      cancelable: true,
      confirmLabel: t("posts.deleteDialog.confirm"),
      cancelLabel: t("posts.deleteDialog.cancel"),
      onConfirm: () => {
        void deleteMutation
          .mutateAsync({ id } satisfies PostSoftDeleteInputSchema)
          .catch(() => undefined);
      },
    });
  };

  return {
    savePost,
    publishPost,
    deletePost,
    isSaving: createMutation.isPending || updateMutation.isPending,
    publishingId: publishMutation.isPending ? publishMutation.variables?.id : undefined,
    deletingId: deleteMutation.isPending ? deleteMutation.variables?.id : undefined,
  };
}
