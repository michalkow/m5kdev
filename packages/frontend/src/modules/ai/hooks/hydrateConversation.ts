import type { UIMessage } from "ai";

export interface HydrateConversationParams {
  readonly serverUrl: string;
  readonly agentId: string;
  readonly threadId: string;
}

export interface ConversationHydrate {
  readonly messages: UIMessage[];
  readonly memory: boolean;
}

export async function hydrateConversation(
  params: HydrateConversationParams
): Promise<ConversationHydrate> {
  const response = await fetch(
    `${params.serverUrl}/ai/chat/${params.agentId}/threads/${params.threadId}`,
    { credentials: "include" }
  );
  if (!response.ok) {
    throw new Error(`Conversation hydrate failed with status ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!isConversationHydrate(body)) {
    throw new Error("Conversation hydrate returned an invalid body");
  }
  return body;
}

function isConversationHydrate(value: unknown): value is ConversationHydrate {
  if (typeof value !== "object" || value === null) return false;
  if (!("messages" in value) || !("memory" in value)) return false;
  return Array.isArray(value.messages) && typeof value.memory === "boolean";
}
