import { PgVector, PostgresStore } from "@mastra/pg";

export const conversationStorageSchema = process.env.MASTRA_DATABASE_SCHEMA ?? "mastra";
export const conversationVectorSchema = process.env.VECTOR_DATABASE_SCHEMA ?? "vectors";
export const conversationEmbeddingIndex = "mastra_embeddings";
export const conversationEmbeddingModel = "openai/text-embedding-3-small";
export const conversationEmbeddingDimensions = 1536;
export const conversationEmbeddingMetric = "cosine" as const;

export function createConversationStorage(initialize = false): PostgresStore {
  const appSchema = process.env.DATABASE_SCHEMA ?? "app";
  if (
    conversationStorageSchema === appSchema ||
    conversationVectorSchema === appSchema ||
    conversationStorageSchema === conversationVectorSchema
  ) {
    throw new Error("App, Mastra storage, and vectors must use separately owned schemas");
  }
  const connectionString = initialize
    ? process.env.MASTRA_DATABASE_DIRECT_URL || process.env.DATABASE_DIRECT_URL
    : process.env.MASTRA_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      initialize
        ? "DATABASE_DIRECT_URL is required for Mastra initialization"
        : "DATABASE_URL is required for Mastra runtime storage"
    );
  }
  return new PostgresStore({
    id: "starter-mastra",
    connectionString,
    schemaName: conversationStorageSchema,
    disableInit: !initialize,
  });
}

export function createConversationVectorProvisioner(): PgVector {
  const connectionString =
    process.env.VECTOR_DATABASE_DIRECT_URL || process.env.DATABASE_DIRECT_URL;
  if (!connectionString)
    throw new Error("DATABASE_DIRECT_URL is required for vector initialization");
  return new PgVector({
    id: "starter-vector-init",
    connectionString,
    schemaName: conversationVectorSchema,
  });
}
