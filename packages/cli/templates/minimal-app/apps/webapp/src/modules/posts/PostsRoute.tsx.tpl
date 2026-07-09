import { Button, Card, Chip, Input, Label, ListBox, Select, Skeleton } from "@heroui/react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  FilePenLineIcon,
  PlusIcon,
} from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { PostCard } from "./components/PostCard";
import { PostEditorModal } from "./components/PostEditorModal";
import type { PostRow, PostStatusFilter } from "./hooks/usePostsList";
import { usePostsRoute } from "./hooks/usePostsRoute";
import { formatDate, getReadingTime } from "./posts.utils";

/** Editor modal state: null = closed, {} = create, { post } = edit. */
type EditorState = { post?: PostRow } | null;

export function PostsRoute() {
  const { t } = useTranslation("blog{{PACKAGE_SCOPE}}");
  const posts = usePostsRoute();

  const searchFieldId = useId();
  const statusFieldId = useId();

  // ephemeral UI state stays in the component; data and actions come from the hook
  const [selectedPostId, setSelectedPostId] = useState<string | undefined>(undefined);
  const [editor, setEditor] = useState<EditorState>(null);

  // derived, not synced: fall back to the first row when the selection is gone
  const selectedPost = posts.rows.find((row) => row.id === selectedPostId) ?? posts.rows[0];

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
            <Button className="rounded-full" variant="primary" onPress={() => setEditor({})}>
              <span className="inline-flex items-center gap-2">
                <PlusIcon className="h-4 w-4" />
                {t("posts.hero.new")}
              </span>
            </Button>
            <Chip className="rounded-full" variant="soft" color="default">
              {posts.isFetching ? t("posts.hero.syncing") : t("posts.hero.synced")}
            </Chip>
          </div>
        </div>

        <div className="grid gap-3 rounded-[28px] border border-white/70 bg-white/72 p-4">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label={t("posts.stats.total")} value={posts.stats.total} accent="amber" />
            <StatCard
              label={t("posts.stats.published")}
              value={posts.stats.published}
              accent="emerald"
            />
            <StatCard label={t("posts.stats.drafts")} value={posts.stats.drafts} accent="stone" />
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div className="grid gap-2">
              <Label className="text-sm font-medium" htmlFor={searchFieldId}>
                {t("posts.filters.searchLabel")}
              </Label>
              <Input
                id={searchFieldId}
                aria-label={t("posts.filters.searchLabel")}
                className="rounded-lg"
                variant="secondary"
                placeholder={t("posts.filters.searchPlaceholder")}
                value={posts.search}
                onChange={(event) => posts.setSearch(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-sm font-medium" htmlFor={statusFieldId}>
                {t("posts.filters.statusLabel")}
              </Label>
              <Select
                aria-label={t("posts.filters.statusLabel")}
                className="w-full"
                variant="secondary"
                selectedKey={posts.status}
                onSelectionChange={(key) => {
                  if (key === null) {
                    return;
                  }
                  posts.setStatus(String(key) as PostStatusFilter);
                }}
              >
                <Select.Trigger id={statusFieldId} className="rounded-lg w-full">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item
                      className="text-sm"
                      id={`${statusFieldId}-all`}
                      textValue={t("posts.filters.all")}
                    >
                      {t("posts.filters.all")}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item
                      className="text-sm"
                      id={`${statusFieldId}-draft`}
                      textValue={t("posts.filters.draft")}
                    >
                      {t("posts.filters.draft")}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item
                      className="text-sm"
                      id={`${statusFieldId}-published`}
                      textValue={t("posts.filters.published")}
                    >
                      {t("posts.filters.published")}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.85fr)]">
        <section className="grid gap-4">
          {posts.isLoading ? (
            <>
              <Skeleton className="h-44 rounded-[28px]" animationType="pulse" />
              <Skeleton className="h-44 rounded-[28px]" animationType="pulse" />
              <Skeleton className="h-44 rounded-[28px]" animationType="pulse" />
            </>
          ) : posts.rows.length === 0 ? (
            <Card className="rounded-[30px] border border-dashed border-amber-300/70 bg-panel shadow-[0_18px_40px_rgba(81,50,24,0.1)]">
              <Card.Content className="flex flex-col items-start gap-4 px-6 py-10">
                <Chip color="default" variant="soft">
                  {t("posts.empty.eyebrow")}
                </Chip>
                <div>
                  <h3 className="font-editorial text-3xl text-ink">{t("posts.empty.title")}</h3>
                  <p className="mt-3 max-w-xl text-sm leading-7 text-muted-ink">
                    {t("posts.empty.body")}
                  </p>
                </div>
                <Button className="rounded-full" variant="primary" onPress={() => setEditor({})}>
                  {t("posts.empty.action")}
                </Button>
              </Card.Content>
            </Card>
          ) : (
            posts.rows.map((row) => (
              <PostCard
                key={row.id}
                row={row}
                isSelected={selectedPost?.id === row.id}
                isPublishing={posts.publishingId === row.id}
                isDeleting={posts.deletingId === row.id}
                onSelect={() => setSelectedPostId(row.id)}
                onEdit={() => setEditor({ post: row })}
                onPublish={() => posts.publishPost(row.id)}
                onDelete={() => posts.deletePost(row.id)}
              />
            ))
          )}

          {posts.rows.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-white/70 bg-white/70 px-4 py-3">
              <p className="text-sm text-muted-ink">
                {t("posts.pagination.summary", {
                  page: posts.page,
                  pageCount: posts.pageCount,
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  className="rounded-full"
                  variant="ghost"
                  isDisabled={posts.page <= 1}
                  onPress={() => posts.goToPage(posts.page - 1)}
                >
                  <span className="inline-flex items-center gap-2">
                    <ArrowLeftIcon className="h-4 w-4" />
                    {t("posts.pagination.previous")}
                  </span>
                </Button>
                <Button
                  className="rounded-full"
                  variant="ghost"
                  isDisabled={posts.page >= posts.pageCount}
                  onPress={() => posts.goToPage(posts.page + 1)}
                >
                  <span className="inline-flex items-center gap-2">
                    {t("posts.pagination.next")}
                    <ArrowRightIcon className="h-4 w-4" />
                  </span>
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        <aside className="sticky top-6 h-fit">
          <Card className="rounded-[30px] border border-white/70 bg-panel shadow-[0_20px_44px_rgba(81,50,24,0.1)]">
            <Card.Header className="flex items-start justify-between px-5 pt-5">
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
                  color={selectedPost.status === "published" ? "success" : "default"}
                  variant="soft"
                >
                  {selectedPost.status === "published"
                    ? t("posts.filters.published")
                    : t("posts.filters.draft")}
                </Chip>
              ) : null}
            </Card.Header>
            <Card.Content className="flex flex-col gap-5 px-5 pb-5">
              {selectedPost ? (
                <>
                  <div className="rounded-[26px] border border-amber-200/70 bg-amber-50/80 p-4">
                    <p className="text-sm leading-7 text-ink/80">{selectedPost.excerpt}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Chip variant="soft" color="default">
                      {getReadingTime(selectedPost.content)}
                    </Chip>
                    <Chip variant="soft">
                      {t("posts.preview.updated")}:{" "}
                      {formatDate(selectedPost.updatedAt ?? selectedPost.createdAt)}
                    </Chip>
                  </div>
                  <div className="prose prose-stone max-w-none text-sm leading-7 text-muted-ink">
                    <p>{selectedPost.content}</p>
                  </div>
                  <Button
                    className="rounded-full"
                    variant="ghost"
                    onPress={() => setEditor({ post: selectedPost })}
                  >
                    <span className="inline-flex items-center gap-2">
                      <FilePenLineIcon className="h-4 w-4" />
                      {t("posts.preview.openEditor")}
                    </span>
                  </Button>
                </>
              ) : (
                <div className="rounded-[26px] border border-dashed border-amber-300/70 bg-amber-50/70 p-6 text-sm leading-7 text-muted-ink">
                  {t("posts.preview.emptyBody")}
                </div>
              )}
            </Card.Content>
          </Card>
        </aside>
      </div>

      <PostEditorModal
        isOpen={editor !== null}
        post={editor?.post}
        isSaving={posts.isSaving}
        onClose={() => setEditor(null)}
        onSave={posts.savePost}
      />
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
