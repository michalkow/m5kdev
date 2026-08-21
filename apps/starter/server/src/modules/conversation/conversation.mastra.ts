import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { STARTER_ASSISTANT_AGENT_ID } from "@starter-app/shared/modules/conversation/conversation.constants";

/** Cheap OpenRouter chat model for the starter Conversation example. */
const STARTER_CHAT_MODEL = "google/gemini-2.5-flash";

export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

const assistant = new Agent({
  id: STARTER_ASSISTANT_AGENT_ID,
  name: "Assistant",
  instructions: "You are a helpful assistant for this starter app. Keep answers concise.",
  model: openrouter.chat(STARTER_CHAT_MODEL, {
    usage: { include: true },
  }),
});

export const mastra = new Mastra({
  agents: {
    [STARTER_ASSISTANT_AGENT_ID]: assistant,
  },
});
