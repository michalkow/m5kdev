import { Chat, useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo } from "react";
import { useAppConfig } from "../../app/hooks/useAppConfig";
import { useSession } from "../../auth/hooks/useSession";
import { hydrateConversation } from "./hydrateConversation";

export interface UseAiChatParams {
  readonly agentId: string;
  readonly threadId: string;
}

export interface GetOrCreateAiChatParams {
  readonly serverUrl: string;
  readonly userId: string;
  readonly agentId: string;
  readonly threadId: string;
}

const chats = new Map<string, Chat<UIMessage>>();
const hydrated = new Set<string>();
const conversationMemory = new Map<string, boolean>();

function chatKey(userId: string, agentId: string, threadId: string): string {
  return `${userId}:${agentId}:${threadId}`;
}

/** Drop in-memory Conversation state so a later session cannot reuse another user's Chat. */
export function clearAiConversationCaches(): void {
  chats.clear();
  hydrated.clear();
  conversationMemory.clear();
}

export function setConversationHasMemory(params: {
  readonly userId: string;
  readonly agentId: string;
  readonly threadId: string;
  readonly memory: boolean;
}): void {
  conversationMemory.set(chatKey(params.userId, params.agentId, params.threadId), params.memory);
}

function lastUserMessage(messages: UIMessage[]): UIMessage[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") return [message];
  }
  return [];
}

export function getOrCreateAiChat({
  serverUrl,
  userId,
  agentId,
  threadId,
}: GetOrCreateAiChatParams): Chat<UIMessage> {
  const key = chatKey(userId, agentId, threadId);
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
      }) => {
        const base = typeof body === "object" && body !== null ? body : {};
        if (conversationMemory.get(key)) {
          return {
            body: {
              ...base,
              messages: lastUserMessage(messages),
              memory: { thread: threadId },
            },
          };
        }
        return {
          body: {
            ...base,
            messages,
          },
        };
      },
    }),
  });
  chats.set(key, created);
  return created;
}

export function useAiChat({ agentId, threadId }: UseAiChatParams): ReturnType<typeof useChat> {
  const { serverUrl } = useAppConfig();
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const chat = useMemo(() => {
    if (!userId) {
      return new Chat<UIMessage>({
        transport: new DefaultChatTransport({
          api: `${serverUrl}/ai/chat/${agentId}`,
          credentials: "include",
          body: { threadId },
        }),
      });
    }
    return getOrCreateAiChat({ serverUrl, userId, agentId, threadId });
  }, [agentId, serverUrl, threadId, userId]);

  useEffect(() => {
    if (!userId) return;
    const key = chatKey(userId, agentId, threadId);
    if (hydrated.has(key)) return;
    hydrated.add(key);
    void hydrateConversation({ serverUrl, agentId, threadId })
      .then((body) => {
        chat.messages = body.messages;
        setConversationHasMemory({ userId, agentId, threadId, memory: body.memory });
      })
      .catch(() => {
        hydrated.delete(key);
      });
  }, [agentId, chat, serverUrl, threadId, userId]);

  return useChat({ chat });
}
