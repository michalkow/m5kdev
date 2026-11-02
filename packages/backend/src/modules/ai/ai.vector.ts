import { PgVector } from "@mastra/pg";

export type AiVectorStoreConfig = {
  connectionString?: string;
  schemaName?: string;
  id?: string;
};

export type AiVectorStoreContext = {
  env?: Record<string, string | undefined>;
  databaseUrl?: string;
};

export function createAiVectorStore(
  config: AiVectorStoreConfig = {},
  context: AiVectorStoreContext = {}
): PgVector {
  const env = context.env ?? process.env;
  const connectionString =
    config.connectionString ?? (env.VECTOR_DATABASE_URL || context.databaseUrl || env.DATABASE_URL);
  try {
    const connection = new URL(connectionString ?? "");
    if (!["postgres:", "postgresql:"].includes(connection.protocol) || !connection.hostname) {
      throw new Error("Invalid connection");
    }
  } catch {
    throw new Error("AI vectors require a PostgreSQL runtime connection URL");
  }
  return new PgVector({
    id: config.id ?? "ai-vector",
    connectionString: connectionString!,
    schemaName: config.schemaName ?? env.VECTOR_DATABASE_SCHEMA ?? "vectors",
    disableInit: true,
  });
}
