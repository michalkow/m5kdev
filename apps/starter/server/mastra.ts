import type { PgVector } from "@mastra/pg";
import {
  conversationEmbeddingDimensions,
  conversationEmbeddingIndex,
  conversationEmbeddingMetric,
  createConversationStorage,
  createConversationVectorProvisioner,
} from "./src/modules/conversation/conversation.persistence";

async function initialize(): Promise<void> {
  const storage = createConversationStorage(true);
  let vector: PgVector | undefined;
  try {
    vector = createConversationVectorProvisioner();
    const extension = await vector.pool.query<{ schema: string }>(
      "SELECT n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'vector'"
    );
    if (extension.rows[0]?.schema !== "public") {
      throw new Error(
        "Provision pgvector in the public schema before Mastra initialization (required for transaction pooling)"
      );
    }
    await storage.init();
    await vector.createIndex({
      indexName: conversationEmbeddingIndex,
      dimension: conversationEmbeddingDimensions,
      metric: conversationEmbeddingMetric,
      buildIndex: false,
    });
  } finally {
    try {
      await vector?.disconnect();
    } finally {
      await storage.close();
    }
  }
}

void initialize().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
