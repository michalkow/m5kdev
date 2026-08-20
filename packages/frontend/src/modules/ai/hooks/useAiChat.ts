import { Chat, useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo } from "react";
import { useAppConfig } from "../../app/hooks/useAppConfig";
import { hydrateConversation } from "./hydrateConversation";

export interface UseAiChatParams {
  readonly agentId: string;
  readonly threadId: string;
}

const chats = new Map<string, Chat<UIMessage>>();
const hydrated = new Set<string>();

function chatKey(agentId: string, threadId: string): string {
  return `${agentId}:${threadId}`;
}

export function useAiChat({ agentId, threadId }: UseAiChatParams): ReturnType<typeof useChat> {
  const { serverUrl } = useAppConfig();
  const key = chatKey(agentId, threadId);

  const chat = useMemo(() => {
    const existing = chats.get(key);
    if (existing) return existing;
    const created = new Chat<UIMessage>({
      transport: new DefaultChatTransport({
        api: `${serverUrl}/ai/chat/${agentId}`,
        credentials: "include",
        body: { threadId },
      }),
    });
    chats.set(key, created);
    return created;
  }, [agentId, key, serverUrl, threadId]);

  useEffect(() => {
    if (hydrated.has(key)) return;
    void hydrateConversation({ serverUrl, agentId, threadId }).then((body) => {
      chat.messages = body.messages;
      hydrated.add(key);
    });
  }, [agentId, chat, key, serverUrl, threadId]);

  return useChat({ chat });
}
