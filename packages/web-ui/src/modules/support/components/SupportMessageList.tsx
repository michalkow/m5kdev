import { Button, Form, Input, Label, TextField } from "@heroui/react";
import type { SupportAppRouter } from "@m5kdev/backend/modules/support/support.trpc";
import type { inferRouterOutputs } from "@trpc/server";
import { useTranslation } from "react-i18next";

type Transcript = inferRouterOutputs<SupportAppRouter>["support"]["getCase"];
export function SupportMessageList({
  messages,
  onDownload,
  onRedact,
  onTranslate,
  onControl,
}: {
  messages: Transcript["messages"];
  onDownload?: (id: string) => Promise<void>;
  onTranslate?: (id: string) => void;
  onControl?: (id: string, action: "retry" | "send-original" | "publish-preview") => void;
  onRedact?: (id: string, reason: string) => Promise<void>;
}) {
  const { t } = useTranslation("web-ui");
  return (
    <div
      role="log"
      aria-label={t("support.messages")}
      aria-live="polite"
      className="flex max-h-80 flex-col gap-3 overflow-y-auto"
    >
      {messages.map((message) => (
        <article key={message.id} className="rounded-lg border border-border p-3">
          <p className="mb-1 text-xs font-medium text-muted">
            {t(`support.author.${message.authorKind}`)}{" "}
            {message.visibility === "internal" && t("support.internalNote")}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm">
            {message.redactedAt ? t("support.redacted") : (message.publishedBody ?? message.body)}
          </p>
          {!message.redactedAt &&
            message.publishedBody &&
            message.publishedBody !== message.body && (
              <details className="text-sm">
                <summary>{t("support.original")}</summary>
                <p className="whitespace-pre-wrap">{message.body}</p>
              </details>
            )}
          {!message.redactedAt &&
            message.renditions?.map((rendition) => (
              <details key={rendition.locale} className="text-sm">
                <summary>
                  {rendition.locale} · {rendition.provider}
                </summary>
                <p className="whitespace-pre-wrap">{rendition.text}</p>
              </details>
            ))}
          {onTranslate && message.publishedAt && !message.redactedAt && (
            <Button size="sm" variant="tertiary" onPress={() => onTranslate(message.id)}>
              {t("support.translate")}
            </Button>
          )}
          {onControl && !message.publishedAt && !message.redactedAt && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs">
                {t(`support.translation.${message.translationState}`)}
              </span>
              {(["retry", "send-original", "publish-preview"] as const).map((action) => (
                <Button
                  key={action}
                  size="sm"
                  variant="secondary"
                  onPress={() => onControl(message.id, action)}
                >
                  {t(`support.publication.${action}`)}
                </Button>
              ))}
            </div>
          )}
          {message.citations?.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block break-all text-sm text-accent underline"
            >
              {url}
            </a>
          ))}
          {message.attachmentIds?.map((id, index) => (
            <Button key={id} size="sm" variant="tertiary" onPress={() => void onDownload?.(id)}>
              {t("support.attachment", { number: index + 1 })}
            </Button>
          ))}
          {onRedact && !message.redactedAt && (
            <Form
              className="mt-2 flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void onRedact(
                  message.id,
                  String(new FormData(event.currentTarget).get("reason") ?? "")
                );
              }}
            >
              <TextField name="reason" isRequired>
                <Label>{t("support.redactReason")}</Label>
                <Input maxLength={1000} />
              </TextField>
              <Button type="submit" size="sm" variant="danger">
                {t("support.redact")}
              </Button>
            </Form>
          )}
        </article>
      ))}
    </div>
  );
}
