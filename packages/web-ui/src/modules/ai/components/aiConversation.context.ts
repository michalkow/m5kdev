import type { useAiChat } from "@m5kdev/frontend/modules/ai/hooks/useAiChat";
import { createContext, useContext } from "react";

export type ShowToolCalls = boolean | readonly string[];

export type AiConversationContextValue = ReturnType<typeof useAiChat> & {
  readonly threadId: string;
  readonly agentId: string;
  readonly showToolCalls: ShowToolCalls;
};

const AiConversationContext = createContext<AiConversationContextValue | null>(null);

export const AiConversationProvider = AiConversationContext.Provider;

export function useAiConversation(): AiConversationContextValue {
  const value = useContext(AiConversationContext);
  if (!value) {
    throw new Error("AiConversation compound parts must be rendered inside AiConversation");
  }
  return value;
}
