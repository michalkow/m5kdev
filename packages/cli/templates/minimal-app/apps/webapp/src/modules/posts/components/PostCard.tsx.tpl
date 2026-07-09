import { Button, Card, Chip } from "@heroui/react";
import { EyeIcon, PencilLineIcon, SendHorizontalIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PostRow } from "../hooks/usePostsList";
import { formatDate, getReadingTime } from "../posts.utils";

interface PostCardProps {
  row: PostRow;
  isSelected: boolean;
  isPublishing: boolean;
  isDeleting: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onPublish: () => void;
  onDelete: () => void;
}

export function PostCard({
  row,
  isSelected,
  isPublishing,
  isDeleting,
  onSelect,
  onEdit,
  onPublish,
  onDelete,
}: PostCardProps) {
  const { t } = useTranslation("blog{{PACKAGE_SCOPE}}");

  return (
    // biome-ignore lint/a11y/useSemanticElements: post row card with nested action buttons
    <Card
      role="button"
      tabIndex={0}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button")) {
          return;
        }
        onSelect();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={
        isSelected
          ? "cursor-pointer rounded-[30px] border border-emerald-300 bg-emerald-950 text-emerald-50 shadow-[0_20px_44px_rgba(31,79,70,0.24)]"
          : "cursor-pointer rounded-[30px] border border-white/70 bg-panel shadow-[0_18px_40px_rgba(81,50,24,0.1)]"
      }
    >
      <Card.Header className="flex items-start justify-between gap-4 px-5 pt-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip
              size="sm"
              color={row.status === "published" ? "success" : "default"}
              variant={isSelected ? "primary" : "soft"}
            >
              {row.status === "published" ? t("posts.filters.published") : t("posts.filters.draft")}
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
          className={`rounded-full ${isSelected ? "bg-emerald-100 text-emerald-950" : "bg-white/80 text-ink"}`}
          variant={isSelected ? "secondary" : "ghost"}
        >
          <EyeIcon className="h-4 w-4" />
        </Button>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4 px-5 pb-5">
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
            className={`rounded-full ${isSelected ? "bg-emerald-100 text-emerald-950" : ""}`}
            variant={isSelected ? "secondary" : "ghost"}
            onPress={onEdit}
          >
            <span className="inline-flex items-center gap-2">
              <PencilLineIcon className="h-4 w-4" />
              {t("posts.actions.edit")}
            </span>
          </Button>
          {row.status === "draft" ? (
            <Button
              className="rounded-full"
              variant="secondary"
              isPending={isPublishing}
              onPress={onPublish}
            >
              <span className="inline-flex items-center gap-2">
                <SendHorizontalIcon className="h-4 w-4" />
                {t("posts.actions.publish")}
              </span>
            </Button>
          ) : null}
          <Button
            className="rounded-full"
            variant="danger"
            isPending={isDeleting}
            onPress={onDelete}
          >
            <span className="inline-flex items-center gap-2">
              <Trash2Icon className="h-4 w-4" />
              {t("posts.actions.delete")}
            </span>
          </Button>
        </div>
      </Card.Content>
    </Card>
  );
}
