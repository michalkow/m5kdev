import { Button, Form, Input, Label, TextField } from "@heroui/react";
import type { SupportAppRouter } from "@m5kdev/backend/modules/support/support.trpc";
import type { inferRouterOutputs } from "@trpc/server";
import { useTranslation } from "react-i18next";

type Transcript = inferRouterOutputs<SupportAppRouter>["support"]["getCase"];
export function SupportMessageList({
  messages,
  onDownload,
  onRedact,
}: {
  messages: Transcript["messages"];
  onDownload?: (id: string) => Promise<void>;
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
            {message.redactedAt ? t("support.redacted") : message.body}
          </p>
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
