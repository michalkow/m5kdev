import { Chat, useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo } from "react";
import { useAppConfig } from "../../app/hooks/useAppConfig";
import { hydrateConversation } from "./hydrateConversation";

export interface UseAiChatParams {
  readonly agentId: string;
  readonly threadId: string;
}

export interface GetOrCreateAiChatParams {
  readonly serverUrl: string;
  readonly agentId: string;
  readonly threadId: string;
}

const chats = new Map<string, Chat<UIMessage>>();
const hydrated = new Set<string>();

function chatKey(agentId: string, threadId: string): string {
  return `${agentId}:${threadId}`;
}

export function getOrCreateAiChat({
  serverUrl,
  agentId,
  threadId,
}: GetOrCreateAiChatParams): Chat<UIMessage> {
  const key = chatKey(agentId, threadId);
  const existing = chats.get(key);
  if (existing) return existing;
  const created = new Chat<UIMessage>({
    transport: new DefaultChatTransport({
      api: `${serverUrl}/ai/chat/${agentId}`,
      credentials: "include",
      body: { threadId },
      prepareSendMessagesRequest: ({
        messages,
        body,
      }: {
        messages: UIMessage[];
        body?: unknown;
      }) => ({
        body: {
          ...(typeof body === "object" && body !== null ? body : {}),
          messages,
        },
      }),
    }),
  });
  chats.set(key, created);
  return created;
}

export function useAiChat({ agentId, threadId }: UseAiChatParams): ReturnType<typeof useChat> {
  const { serverUrl } = useAppConfig();
  const key = chatKey(agentId, threadId);

  const chat = useMemo(
    () => getOrCreateAiChat({ serverUrl, agentId, threadId }),
    [agentId, serverUrl, threadId]
  );

  useEffect(() => {
    if (hydrated.has(key)) return;
    hydrated.add(key);
    void hydrateConversation({ serverUrl, agentId, threadId }).then((body) => {
      chat.messages = body.messages;
    });
  }, [agentId, chat, key, serverUrl, threadId]);

  return useChat({ chat });
}
