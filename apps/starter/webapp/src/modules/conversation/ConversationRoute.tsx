import { Card, Skeleton } from "@heroui/react";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { AiConversation } from "@m5kdev/web-ui/modules/ai/components/AiConversation";
import { STARTER_ASSISTANT_AGENT_ID } from "@starter-app/shared/modules/conversation/conversation.constants";
import { useTranslation } from "react-i18next";

export function ConversationRoute() {
  const { t } = useTranslation("starter-app");
  const { data: session } = useSession();
  const threadId = session?.user?.id;

  return (
    <div
      className="grid h-svh grid-rows-[auto_minmax(0,1fr)] gap-4 p-4"
      data-testid="conversation-route"
    >
      <Card>
        <Card.Header className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("conversation.hero.eyebrow")}
          </p>
          <Card.Title>{t("conversation.hero.title")}</Card.Title>
          <Card.Description>{t("conversation.hero.body")}</Card.Description>
        </Card.Header>
      </Card>

      {threadId ? (
        <div className="min-h-0 overflow-hidden rounded-xl border">
          <AiConversation agentId={STARTER_ASSISTANT_AGENT_ID} threadId={threadId} />
        </div>
      ) : (
        <Skeleton className="min-h-0 rounded-xl" />
      )}
    </div>
  );
}
