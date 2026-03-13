import {
  POST_FILTER_VALUES,
  POSTS_PAGE_SIZE,
} from "{{PACKAGE_SCOPE}}/shared/modules/posts/posts.constants";
import type {
  PostCreateInputSchema,
  PostPublishInputSchema,
  PostSoftDeleteInputSchema,
  PostsListInputSchema,
  PostsListOutputSchema,
  PostUpdateInputSchema,
} from "{{PACKAGE_SCOPE}}/shared/modules/posts/posts.schema";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Skeleton,
  Textarea,
} from "@heroui/react";
import { useDialog } from "@m5kdev/web-ui/components/DialogProvider";
import { type UseQueryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  EyeIcon,
  FilePenLineIcon,
  PencilLineIcon,
  PlusIcon,
  SendHorizontalIcon,
  Trash2Icon,
} from "lucide-react";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import {
  type FormEvent,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useTRPC } from "@/utils/trpc";

type PostStatusFilter = (typeof POST_FILTER_VALUES)[number];

interface EditorState {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
}

const STATUS_PARSER = parseAsStringLiteral(POST_FILTER_VALUES).withDefault("all");

function formatDate(value: Date | null | undefined): string {
  if (!value) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getReadingTime(content: string): string {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 180));
  return `${minutes} min read`;
}

export function PostsRoute() {
  const { t } = useTranslation("blog-app");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const showDialog = useDialog();

  const [search, setSearch] = useQueryState("search", parseAsString.withDefault(""));
  const [status, setStatus] = useQueryState<PostStatusFilter>("status", STATUS_PARSER);
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const [selectedPostId, setSelectedPostId] = useState<string | undefined>(undefined);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorState, setEditorState] = useState<EditorState>({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
  });

  const deferredSearch = useDeferredValue(search);

  const listInput = useMemo<PostsListInputSchema>(
    () => ({
      page,
      limit: POSTS_PAGE_SIZE,
      search: deferredSearch || undefined,
      status: status === "all" ? undefined : status,
      sort: "updatedAt",
      order: "desc",
    }),
    [deferredSearch, page, status]
  );

  const { data, isLoading, isFetching } = useQuery(
    trpc.posts.list.queryOptions(listInput) as unknown as UseQueryOptions<PostsListOutputSchema>
  );

  const postsData = data;
  const rows = postsData?.rows ?? [];
  const total = postsData?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / POSTS_PAGE_SIZE));

  useEffect(() => {
    if (!rows.length) {
      setSelectedPostId(undefined);
      return;
    }

    const selectedStillExists = rows.some((row) => row.id === selectedPostId);
    if (!selectedStillExists) {
      setSelectedPostId(rows[0]?.id);
    }
  }, [rows, selectedPostId]);

  const selectedPost = useMemo(
    () => rows.find((row) => row.id === selectedPostId) ?? rows[0],
    [rows, selectedPostId]
  );

  const invalidateList = async () => {
    await queryClient.invalidateQueries(trpc.posts.list.queryFilter());
  };

  const createMutation = useMutation(
    trpc.posts.create.mutationOptions({
      onSuccess: async () => {
        toast.success(t("posts.toast.created"));
        setIsEditorOpen(false);
        setEditorState({ title: "", slug: "", excerpt: "", content: "" });
        await invalidateList();
      },
    })
  );

  const updateMutation = useMutation(
    trpc.posts.update.mutationOptions({
      onSuccess: async () => {
        toast.success(t("posts.toast.updated"));
        setIsEditorOpen(false);
        await invalidateList();
      },
    })
  );

  const publishMutation = useMutation(
    trpc.posts.publish.mutationOptions({
      onSuccess: async () => {
        toast.success(t("posts.toast.published"));
        await invalidateList();
      },
    })
  );

  const deleteMutation = useMutation(
    trpc.posts.softDelete.mutationOptions({
      onSuccess: async () => {
        toast.success(t("posts.toast.deleted"));
        await invalidateList();
      },
    })
  );

  const openCreate = () => {
    setEditorState({ title: "", slug: "", excerpt: "", content: "" });
    setIsEditorOpen(true);
  };

  const openEdit = (row: PostsListOutputSchema["rows"][number]) => {
    setEditorState({
      id: row.id,
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt ?? "",
      content: row.content,
    });
    setIsEditorOpen(true);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const payload = {
      title: editorState.title.trim(),
      slug: editorState.slug.trim() || undefined,
      excerpt: editorState.excerpt.trim() || undefined,
      content: editorState.content.trim(),
    } satisfies Omit<PostCreateInputSchema, never>;

    if (!payload.title || !payload.content) {
      toast.error(t("posts.toast.validation"));
      return;
    }

    if (editorState.id) {
      await updateMutation.mutateAsync({
        id: editorState.id,
        ...payload,
      } as PostUpdateInputSchema);
      return;
    }

    await createMutation.mutateAsync(payload);
  };

  const onPublish = async (id: string) => {
    await publishMutation.mutateAsync({ id } satisfies PostPublishInputSchema);
  };

  const onDelete = (id: string) => {
    showDialog({
      title: t("posts.deleteDialog.title"),
      description: t("posts.deleteDialog.body"),
      color: "danger",
      cancelable: true,
      confirmLabel: t("posts.deleteDialog.confirm"),
      cancelLabel: t("posts.deleteDialog.cancel"),
      onConfirm: () => {
        void deleteMutation.mutateAsync({ id } satisfies PostSoftDeleteInputSchema);
      },
    });
  };

  const stats = useMemo(() => {
    const published = rows.filter((row) => row.status === "published").length;
    const drafts = rows.filter((row) => row.status === "draft").length;

    return {
      published,
      drafts,
      total,
    };
  }, [rows, total]);

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 rounded-[30px] border border-amber-200/70 bg-panel px-5 py-5 shadow-[0_18px_40px_rgba(81,50,24,0.12)] lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)] lg:px-6">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.32em] text-amber-700/80">
            {t("posts.hero.eyebrow")}
          </p>
          <h2 className="mt-3 font-editorial text-5xl leading-none text-ink">
            {t("posts.hero.title")}
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-ink">{t("posts.hero.body")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              radius="full"
              color="primary"
              startContent={<PlusIcon className="h-4 w-4" />}
              onPress={openCreate}
            >
              {t("posts.hero.new")}
            </Button>
            <Chip radius="full" variant="flat" color="secondary">
              {isFetching ? t("posts.hero.syncing") : t("posts.hero.synced")}
            </Chip>
          </div>
        </div>

        <div className="grid gap-3 rounded-[28px] border border-white/70 bg-white/72 p-4">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label={t("posts.stats.total")} value={stats.total} accent="amber" />
            <StatCard label={t("posts.stats.published")} value={stats.published} accent="emerald" />
            <StatCard label={t("posts.stats.drafts")} value={stats.drafts} accent="stone" />
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <Input
              aria-label={t("posts.filters.searchLabel")}
              radius="lg"
              variant="bordered"
              label={t("posts.filters.searchLabel")}
              placeholder={t("posts.filters.searchPlaceholder")}
              value={search}
              onValueChange={(value) => {
                startTransition(() => {
                  void setSearch(value || null);
                  void setPage(1);
                });
              }}
            />
            <Select
              aria-label={t("posts.filters.statusLabel")}
              label={t("posts.filters.statusLabel")}
              radius="lg"
              variant="bordered"
              selectedKeys={[status]}
              onSelectionChange={(keys) => {
                const nextValue = Array.from(keys)[0] as PostStatusFilter | undefined;
                startTransition(() => {
                  void setStatus(nextValue ?? "all");
                  void setPage(1);
                });
              }}
            >
              <SelectItem key="all">{t("posts.filters.all")}</SelectItem>
              <SelectItem key="draft">{t("posts.filters.draft")}</SelectItem>
              <SelectItem key="published">{t("posts.filters.published")}</SelectItem>
            </Select>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.85fr)]">
        <section className="grid gap-4">
          {isLoading ? (
            <>
              <Skeleton className="h-44 rounded-[28px]" />
              <Skeleton className="h-44 rounded-[28px]" />
              <Skeleton className="h-44 rounded-[28px]" />
            </>
          ) : rows.length === 0 ? (
            <Card className="rounded-[30px] border border-dashed border-amber-300/70 bg-panel shadow-[0_18px_40px_rgba(81,50,24,0.1)]">
              <CardBody className="items-start gap-4 px-6 py-10">
                <Chip color="secondary" variant="flat">
                  {t("posts.empty.eyebrow")}
                </Chip>
                <div>
                  <h3 className="font-editorial text-3xl text-ink">{t("posts.empty.title")}</h3>
                  <p className="mt-3 max-w-xl text-sm leading-7 text-muted-ink">
                    {t("posts.empty.body")}
                  </p>
                </div>
                <Button color="primary" radius="full" onPress={openCreate}>
                  {t("posts.empty.action")}
                </Button>
              </CardBody>
            </Card>
          ) : (
            rows.map((row) => {
              const isSelected = selectedPost?.id === row.id;
              const isPublishing =
                publishMutation.isPending && publishMutation.variables?.id === row.id;
              const isDeleting =
                deleteMutation.isPending && deleteMutation.variables?.id === row.id;

              return (
                <Card
                  key={row.id}
                  isPressable
                  onPress={() => setSelectedPostId(row.id)}
                  className={
                    isSelected
                      ? "rounded-[30px] border border-emerald-300 bg-emerald-950 text-emerald-50 shadow-[0_20px_44px_rgba(31,79,70,0.24)]"
                      : "rounded-[30px] border border-white/70 bg-panel shadow-[0_18px_40px_rgba(81,50,24,0.1)]"
                  }
                >
                  <CardHeader className="flex items-start justify-between gap-4 px-5 pt-5">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip
                          size="sm"
                          color={row.status === "published" ? "success" : "secondary"}
                          variant={isSelected ? "solid" : "flat"}
                        >
                          {row.status === "published"
                            ? t("posts.filters.published")
                            : t("posts.filters.draft")}
                        </Chip>
                        <span className={isSelected ? "text-emerald-100/80" : "text-muted-ink"}>
                          {getReadingTime(row.content)}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-editorial text-3xl leading-none">{row.title}</h3>
                        <p
                          className={
                            isSelected
                              ? "mt-3 text-sm leading-7 text-emerald-100/80"
                              : "mt-3 text-sm leading-7 text-muted-ink"
                          }
                        >
                          {row.excerpt}
                        </p>
                      </div>
                    </div>
                    <Button
                      isIconOnly
                      radius="full"
                      variant={isSelected ? "solid" : "flat"}
                      className={
                        isSelected ? "bg-emerald-100 text-emerald-950" : "bg-white/80 text-ink"
                      }
                    >
                      <EyeIcon className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardBody className="gap-4 px-5 pb-5">
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className={isSelected ? "text-emerald-100/80" : "text-muted-ink"}>
                        {t("posts.meta.updated")}: {formatDate(row.updatedAt ?? row.createdAt)}
                      </span>
                      {row.publishedAt ? (
                        <span className={isSelected ? "text-emerald-100/80" : "text-muted-ink"}>
                          {t("posts.meta.published")}: {formatDate(row.publishedAt)}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        radius="full"
                        variant={isSelected ? "solid" : "flat"}
                        className={isSelected ? "bg-emerald-100 text-emerald-950" : ""}
                        startContent={<PencilLineIcon className="h-4 w-4" />}
                        onPress={() => openEdit(row)}
                      >
                        {t("posts.actions.edit")}
                      </Button>
                      {row.status === "draft" ? (
                        <Button
                          radius="full"
                          color="secondary"
                          variant={isSelected ? "solid" : "flat"}
                          isLoading={isPublishing}
                          startContent={<SendHorizontalIcon className="h-4 w-4" />}
                          onPress={() => void onPublish(row.id)}
                        >
                          {t("posts.actions.publish")}
                        </Button>
                      ) : null}
                      <Button
                        radius="full"
                        color="danger"
                        variant="flat"
                        isLoading={isDeleting}
                        startContent={<Trash2Icon className="h-4 w-4" />}
                        onPress={() => onDelete(row.id)}
                      >
                        {t("posts.actions.delete")}
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              );
            })
          )}

          {rows.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-white/70 bg-white/70 px-4 py-3">
              <p className="text-sm text-muted-ink">
                {t("posts.pagination.summary", {
                  page,
                  pageCount,
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  radius="full"
                  variant="flat"
                  isDisabled={page <= 1}
                  startContent={<ArrowLeftIcon className="h-4 w-4" />}
                  onPress={() => {
                    startTransition(() => {
                      void setPage(Math.max(1, page - 1));
                    });
                  }}
                >
                  {t("posts.pagination.previous")}
                </Button>
                <Button
                  radius="full"
                  variant="flat"
                  isDisabled={page >= pageCount}
                  endContent={<ArrowRightIcon className="h-4 w-4" />}
                  onPress={() => {
                    startTransition(() => {
                      void setPage(Math.min(pageCount, page + 1));
                    });
                  }}
                >
                  {t("posts.pagination.next")}
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        <aside className="sticky top-6 h-fit">
          <Card className="rounded-[30px] border border-white/70 bg-panel shadow-[0_20px_44px_rgba(81,50,24,0.1)]">
            <CardHeader className="items-start justify-between px-5 pt-5">
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-amber-700/80">
                  {t("posts.preview.eyebrow")}
                </p>
                <h3 className="mt-3 font-editorial text-4xl leading-none text-ink">
                  {selectedPost?.title ?? t("posts.preview.emptyTitle")}
                </h3>
              </div>
              {selectedPost ? (
                <Chip
                  color={selectedPost.status === "published" ? "success" : "secondary"}
                  variant="flat"
                >
                  {selectedPost.status === "published"
                    ? t("posts.filters.published")
                    : t("posts.filters.draft")}
                </Chip>
              ) : null}
            </CardHeader>
            <CardBody className="gap-5 px-5 pb-5">
              {selectedPost ? (
                <>
                  <div className="rounded-[26px] border border-amber-200/70 bg-amber-50/80 p-4">
                    <p className="text-sm leading-7 text-ink/80">{selectedPost.excerpt}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Chip variant="flat" color="secondary">
                      {getReadingTime(selectedPost.content)}
                    </Chip>
                    <Chip variant="flat">
                      {t("posts.preview.updated")}:{" "}
                      {formatDate(selectedPost.updatedAt ?? selectedPost.createdAt)}
                    </Chip>
                  </div>
                  <div className="prose prose-stone max-w-none text-sm leading-7 text-muted-ink">
                    <p>{selectedPost.content}</p>
                  </div>
                  <Button
                    radius="full"
                    variant="flat"
                    startContent={<FilePenLineIcon className="h-4 w-4" />}
                    onPress={() => openEdit(selectedPost)}
                  >
                    {t("posts.preview.openEditor")}
                  </Button>
                </>
              ) : (
                <div className="rounded-[26px] border border-dashed border-amber-300/70 bg-amber-50/70 p-6 text-sm leading-7 text-muted-ink">
                  {t("posts.preview.emptyBody")}
                </div>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>

      <Modal
        isOpen={isEditorOpen}
        onOpenChange={setIsEditorOpen}
        size="4xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          <form onSubmit={onSubmit}>
            <ModalHeader className="flex flex-col gap-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-amber-700/80">
                {editorState.id ? t("posts.editor.editEyebrow") : t("posts.editor.newEyebrow")}
              </p>
              <h3 className="font-editorial text-4xl leading-none text-ink">
                {editorState.id ? t("posts.editor.editTitle") : t("posts.editor.newTitle")}
              </h3>
            </ModalHeader>
            <ModalBody className="grid gap-4 pb-2">
              <Input
                label={t("posts.editor.fields.title")}
                radius="lg"
                variant="bordered"
                value={editorState.title}
                onValueChange={(value) => setEditorState((state) => ({ ...state, title: value }))}
                isRequired
              />
              <Input
                label={t("posts.editor.fields.slug")}
                radius="lg"
                variant="bordered"
                value={editorState.slug}
                onValueChange={(value) => setEditorState((state) => ({ ...state, slug: value }))}
              />
              <Textarea
                label={t("posts.editor.fields.excerpt")}
                radius="lg"
                variant="bordered"
                minRows={3}
                value={editorState.excerpt}
                onValueChange={(value) => setEditorState((state) => ({ ...state, excerpt: value }))}
              />
              <Textarea
                label={t("posts.editor.fields.content")}
                radius="lg"
                variant="bordered"
                minRows={10}
                value={editorState.content}
                onValueChange={(value) => setEditorState((state) => ({ ...state, content: value }))}
                isRequired
              />
            </ModalBody>
            <ModalFooter>
              <Button radius="full" variant="light" onPress={() => setIsEditorOpen(false)}>
                {t("posts.editor.cancel")}
              </Button>
              <Button
                radius="full"
                color="primary"
                type="submit"
                isLoading={createMutation.isPending || updateMutation.isPending}
              >
                {editorState.id ? t("posts.editor.save") : t("posts.editor.create")}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "amber" | "emerald" | "stone";
}) {
  const accentClass =
    accent === "amber"
      ? "border-amber-200 bg-amber-50/90 text-amber-900"
      : accent === "emerald"
        ? "border-emerald-200 bg-emerald-50/90 text-emerald-900"
        : "border-stone-200 bg-stone-100/90 text-stone-900";

  return (
    <div className={`rounded-[24px] border px-4 py-4 ${accentClass}`}>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em]">{label}</p>
      <p className="mt-3 font-editorial text-4xl leading-none">{value}</p>
    </div>
  );
}
