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
  const { t } = useTranslation("starter-app");

  return (
    <Card variant={isSelected ? "secondary" : undefined}>
      <Card.Header className="flex items-start justify-between gap-4">
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip
              size="sm"
              color={row.status === "published" ? "success" : "default"}
              variant="soft"
            >
              {row.status === "published" ? t("posts.filters.published") : t("posts.filters.draft")}
            </Chip>
            <Chip size="sm" variant="soft" color="default">
              {getReadingTime(row.content)}
            </Chip>
          </div>
          <div className="grid gap-1">
            <Card.Title>{row.title}</Card.Title>
            {row.excerpt ? <Card.Description>{row.excerpt}</Card.Description> : null}
          </div>
        </div>
        <Button
          isIconOnly
          variant={isSelected ? "secondary" : "ghost"}
          aria-label={t("posts.preview.eyebrow")}
          onPress={onSelect}
        >
          <EyeIcon className="h-4 w-4" />
        </Button>
      </Card.Header>
      <Card.Content>
        <div className="flex flex-wrap gap-2">
          <Chip size="sm" variant="soft">
            {t("posts.meta.updated")}: {formatDate(row.updatedAt ?? row.createdAt)}
          </Chip>
          {row.publishedAt ? (
            <Chip size="sm" variant="soft">
              {t("posts.meta.published")}: {formatDate(row.publishedAt)}
            </Chip>
          ) : null}
        </div>
      </Card.Content>
      <Card.Footer className="flex flex-wrap gap-2">
        <Button variant="ghost" onPress={onEdit}>
          <span className="inline-flex items-center gap-2">
            <PencilLineIcon className="h-4 w-4" />
            {t("posts.actions.edit")}
          </span>
        </Button>
        {row.status === "draft" ? (
          <Button variant="secondary" isPending={isPublishing} onPress={onPublish}>
            <span className="inline-flex items-center gap-2">
              <SendHorizontalIcon className="h-4 w-4" />
              {t("posts.actions.publish")}
            </span>
          </Button>
        ) : null}
        <Button variant="danger" isPending={isDeleting} onPress={onDelete}>
          <span className="inline-flex items-center gap-2">
            <Trash2Icon className="h-4 w-4" />
            {t("posts.actions.delete")}
          </span>
        </Button>
      </Card.Footer>
    </Card>
  );
}
