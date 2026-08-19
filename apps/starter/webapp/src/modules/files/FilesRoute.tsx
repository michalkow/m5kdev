import { Button, Card, Chip, EmptyState, Skeleton } from "@heroui/react";
import { ImageIcon, UploadIcon } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useFilesRoute } from "./hooks/useFilesRoute";

export function FilesRoute() {
  const { t } = useTranslation("starter-app");
  const files = useFilesRoute();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="p-4 grid gap-6" data-testid="files-route">
      <Card>
        <Card.Header className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("files.hero.eyebrow")}
          </p>
          <Card.Title>{t("files.hero.title")}</Card.Title>
          <Card.Description>{t("files.hero.body")}</Card.Description>
        </Card.Header>
        <Card.Content className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              data-testid="file-upload-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) files.upload(file);
                event.target.value = "";
              }}
            />
            <Button
              variant="primary"
              isDisabled={files.isUploading}
              data-testid="file-upload"
              onPress={() => inputRef.current?.click()}
            >
              <span className="inline-flex items-center gap-2">
                <UploadIcon className="h-4 w-4" />
                {t("files.hero.upload")}
              </span>
            </Button>
            <Chip variant="soft" color="default">
              {files.isFetching ? t("files.hero.syncing") : t("files.hero.synced")}
            </Chip>
          </div>
        </Card.Content>
      </Card>

      {files.isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : files.rows.length === 0 ? (
        <EmptyState className="flex flex-col items-center gap-4 py-10 text-center">
          <ImageIcon className="size-6 text-muted" />
          <div className="grid gap-2">
            <p className="text-lg font-semibold">{t("files.empty.title")}</p>
            <p className="max-w-xl text-sm text-muted">{t("files.empty.body")}</p>
          </div>
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {files.rows.map((row) => (
            <Card key={row.id} data-testid="file-row">
              <Card.Header className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1">
                  <Card.Title>{row.originalName}</Card.Title>
                  <Card.Description>{row.contentType}</Card.Description>
                </div>
                {row.memberId ? (
                  <Chip size="sm" variant="soft" color="default">
                    {t("files.row.organization")}
                  </Chip>
                ) : null}
              </Card.Header>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
