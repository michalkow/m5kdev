import { EmptyState } from "@heroui/react";
import { useAiChat } from "@m5kdev/frontend/modules/ai/hooks/useAiChat";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AiConversationProvider, useAiConversation } from "./aiConversation.context";

export interface AiConversationProps {
  readonly threadId: string;
  readonly agentId: string;
  readonly children?: ReactNode;
}

function AiConversationRoot({ threadId, agentId, children }: AiConversationProps) {
  const chat = useAiChat({ agentId, threadId });
  return (
    <AiConversationProvider value={{ ...chat, threadId, agentId }}>
      <div className="flex h-full min-h-0 w-full flex-col">
        {children ?? <AiConversationMessages />}
      </div>
    </AiConversationProvider>
  );
}

function AiConversationMessages() {
  const { messages } = useAiConversation();
  const { t } = useTranslation("web-ui");

  if (messages.length > 0) {
    return <div className="min-h-0 flex-1 overflow-y-auto" />;
  }

  return (
    <EmptyState className="flex h-full w-full flex-col items-center justify-center gap-4 py-10 text-center">
      <span className="text-sm text-muted-foreground">{t("ai.conversation.empty")}</span>
    </EmptyState>
  );
}

function AiConversationPrompt() {
  return null;
}

export const AiConversation = Object.assign(AiConversationRoot, {
  Messages: AiConversationMessages,
  Prompt: AiConversationPrompt,
});
