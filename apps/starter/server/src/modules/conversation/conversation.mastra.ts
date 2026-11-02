import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { STARTER_ASSISTANT_AGENT_ID } from "@starter-app/shared/modules/conversation/conversation.constants";
import {
  conversationEmbeddingDimensions,
  conversationEmbeddingIndex,
  conversationEmbeddingMetric,
  conversationStorageSchema,
  conversationVectorSchema,
  createConversationStorage,
} from "./conversation.persistence";

export const conversationStorage = createConversationStorage();

export async function verifyConversationPersistence(): Promise<void> {
  const tables = await conversationStorage.pool.query<{ ready: boolean }>(
    "SELECT to_regclass(format('%I.%I', $1::text, 'mastra_threads')) IS NOT NULL AND to_regclass(format('%I.%I', $1::text, 'mastra_messages')) IS NOT NULL AS ready",
    [conversationStorageSchema]
  );
  if (!tables.rows[0]?.ready)
    throw new Error(
      "Mastra storage is not ready; run mastra:init using the direct connection before startup"
    );
  const { PgVector } = await import("@mastra/pg");
  const vector = new PgVector({
    id: "starter-vector-readiness",
    connectionString: process.env.VECTOR_DATABASE_URL || process.env.DATABASE_URL!,
    schemaName: conversationVectorSchema,
    disableInit: true,
  });
  try {
    const extension = await vector.pool.query<{ ready: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'vector' AND n.nspname = 'public') AS ready"
    );
    if (!extension.rows[0]?.ready)
      throw new Error(
        "Provision pgvector in public before startup (transaction pooling requires this)"
      );
    const index = await vector.describeIndex({ indexName: conversationEmbeddingIndex });
    if (
      index.dimension !== conversationEmbeddingDimensions ||
      index.metric !== conversationEmbeddingMetric
    )
      throw new Error("Starter vector configuration differs from the provisioned index");
  } finally {
    await vector.disconnect();
  }
}

/** Cheap OpenRouter chat model for the starter Conversation example. */
const STARTER_CHAT_MODEL = "google/gemini-2.5-flash";

export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

const assistant = new Agent({
  id: STARTER_ASSISTANT_AGENT_ID,
  name: "Assistant",
  instructions: "You are a helpful assistant for this starter app. Keep answers concise.",
  memory: new Memory({ storage: conversationStorage, options: { semanticRecall: false } }),
  model: openrouter.chat(STARTER_CHAT_MODEL, {
    usage: { include: true },
  }),
});

export const mastra = new Mastra({
  storage: conversationStorage,
  agents: {
    [STARTER_ASSISTANT_AGENT_ID]: assistant,
  },
});
