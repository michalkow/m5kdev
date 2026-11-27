import type { SupportAppRouter } from "@m5kdev/backend/modules/support/support.trpc";
import type { inferRouterOutputs } from "@trpc/server";
import { useTranslation } from "react-i18next";

type Transcript = inferRouterOutputs<SupportAppRouter>["support"]["getCase"];
export function SupportMessageList({ messages }: { messages: Transcript["messages"] }) {
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
            {t(`support.author.${message.authorKind}`)}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
        </article>
      ))}
    </div>
  );
}
