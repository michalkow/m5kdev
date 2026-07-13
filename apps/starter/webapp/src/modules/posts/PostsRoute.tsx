import {
  Button,
  Card,
  Chip,
  EmptyState,
  Label,
  ListBox,
  Pagination,
  SearchField,
  Select,
  Skeleton,
} from "@heroui/react";
import { FilePenLineIcon, FileTextIcon, PlusIcon } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { PostCard } from "./components/PostCard";
import { PostEditorModal } from "./components/PostEditorModal";
import type { PostRow, PostStatusFilter } from "./hooks/usePostsList";
import { usePostsRoute } from "./hooks/usePostsRoute";
import { formatDate, getReadingTime } from "./posts.utils";

/** Editor modal state: null = closed, {} = create, { post } = edit. */
type EditorState = { post?: PostRow } | null;

const STATUS_OPTIONS = ["all", "draft", "published"] as const satisfies readonly PostStatusFilter[];

export function PostsRoute() {
  const { t } = useTranslation("starter-app");
  const posts = usePostsRoute();

  const statusFieldId = useId();

  const [selectedPostId, setSelectedPostId] = useState<string | undefined>(undefined);
  const [editor, setEditor] = useState<EditorState>(null);

  const selectedPost = posts.rows.find((row) => row.id === selectedPostId) ?? posts.rows[0];
  const isFirstPage = posts.page <= 1;
  const isLastPage = posts.page >= posts.pageCount;

  return (
    <div className="p-4 grid gap-6" data-testid="posts-route">
      <Card>
        <Card.Header className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("posts.hero.eyebrow")}
          </p>
          <Card.Title>{t("posts.hero.title")}</Card.Title>
          <Card.Description>{t("posts.hero.body")}</Card.Description>
        </Card.Header>
        <Card.Content className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onPress={() => setEditor({})}>
              <span className="inline-flex items-center gap-2">
                <PlusIcon className="h-4 w-4" />
                {t("posts.hero.new")}
              </span>
            </Button>
            <Chip variant="soft" color="default">
              {posts.isFetching ? t("posts.hero.syncing") : t("posts.hero.synced")}
            </Chip>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Card variant="secondary">
              <Card.Header>
                <Card.Description>{t("posts.stats.total")}</Card.Description>
                <Card.Title>{posts.stats.total}</Card.Title>
              </Card.Header>
            </Card>
            <Card variant="secondary">
              <Card.Header>
                <Card.Description>{t("posts.stats.published")}</Card.Description>
                <Card.Title>{posts.stats.published}</Card.Title>
              </Card.Header>
            </Card>
            <Card variant="secondary">
              <Card.Header>
                <Card.Description>{t("posts.stats.drafts")}</Card.Description>
                <Card.Title>{posts.stats.drafts}</Card.Title>
              </Card.Header>
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <SearchField
              aria-label={t("posts.filters.searchLabel")}
              name="search"
              variant="secondary"
              value={posts.search}
              onChange={posts.setSearch}
            >
              <Label>{t("posts.filters.searchLabel")}</Label>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder={t("posts.filters.searchPlaceholder")} />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>

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
                <Select.Trigger id={statusFieldId} className="w-full">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {STATUS_OPTIONS.map((status) => (
                      <ListBox.Item
                        key={status}
                        id={`${statusFieldId}-${status}`}
                        textValue={t(`posts.filters.${status === "all" ? "all" : status}`)}
                      >
                        {t(`posts.filters.${status === "all" ? "all" : status}`)}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
          </div>
        </Card.Content>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.85fr)]">
        <section className="grid gap-4">
          {posts.isLoading ? (
            <>
              <Skeleton className="h-44" animationType="pulse" />
              <Skeleton className="h-44" animationType="pulse" />
              <Skeleton className="h-44" animationType="pulse" />
            </>
          ) : posts.rows.length === 0 ? (
            <EmptyState className="flex flex-col items-center gap-4 py-10 text-center">
              <FileTextIcon className="size-6 text-muted" />
              <Chip color="default" variant="soft">
                {t("posts.empty.eyebrow")}
              </Chip>
              <div className="grid gap-2">
                <p className="text-lg font-semibold">{t("posts.empty.title")}</p>
                <p className="max-w-xl text-sm text-muted">{t("posts.empty.body")}</p>
              </div>
              <Button variant="primary" onPress={() => setEditor({})}>
                {t("posts.empty.action")}
              </Button>
            </EmptyState>
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
            <Pagination size="sm">
              <Pagination.Summary>
                {t("posts.pagination.summary", {
                  page: posts.page,
                  pageCount: posts.pageCount,
                })}
              </Pagination.Summary>
              <Pagination.Content>
                <Pagination.Item>
                  <Pagination.Previous
                    isDisabled={isFirstPage}
                    onPress={() => posts.goToPage(posts.page - 1)}
                  >
                    <Pagination.PreviousIcon />
                    {t("posts.pagination.previous")}
                  </Pagination.Previous>
                </Pagination.Item>
                <Pagination.Item>
                  <Pagination.Next
                    isDisabled={isLastPage}
                    onPress={() => posts.goToPage(posts.page + 1)}
                  >
                    {t("posts.pagination.next")}
                    <Pagination.NextIcon />
                  </Pagination.Next>
                </Pagination.Item>
              </Pagination.Content>
            </Pagination>
          ) : null}
        </section>

        <aside className="sticky top-6 h-fit">
          <Card>
            <Card.Header className="flex items-start justify-between gap-4">
              <div className="grid gap-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  {t("posts.preview.eyebrow")}
                </p>
                <Card.Title>{selectedPost?.title ?? t("posts.preview.emptyTitle")}</Card.Title>
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
            <Card.Content className="flex flex-col gap-4">
              {selectedPost ? (
                <>
                  {selectedPost.excerpt ? (
                    <Card variant="secondary">
                      <Card.Content>
                        <p className="text-sm text-muted">{selectedPost.excerpt}</p>
                      </Card.Content>
                    </Card>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Chip variant="soft" color="default">
                      {getReadingTime(selectedPost.content)}
                    </Chip>
                    <Chip variant="soft">
                      {t("posts.preview.updated")}:{" "}
                      {formatDate(selectedPost.updatedAt ?? selectedPost.createdAt)}
                    </Chip>
                  </div>
                  <p className="text-sm leading-7 text-muted">{selectedPost.content}</p>
                </>
              ) : (
                <Card.Description>{t("posts.preview.emptyBody")}</Card.Description>
              )}
            </Card.Content>
            {selectedPost ? (
              <Card.Footer>
                <Button variant="ghost" onPress={() => setEditor({ post: selectedPost })}>
                  <span className="inline-flex items-center gap-2">
                    <FilePenLineIcon className="h-4 w-4" />
                    {t("posts.preview.openEditor")}
                  </span>
                </Button>
              </Card.Footer>
            ) : null}
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
