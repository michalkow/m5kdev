import { LibSQLVector } from "@mastra/libsql";

export type AiVectorStoreConfig = {
  /**
   * Remote libsql/Turso URL, always used as a direct connection — never as an
   * embedded replica, so the vector store cannot contend on a local WAL.
   */
  url?: string;
  authToken?: string;
  /**
   * Local file used only when no remote `url` is configured. Dev convenience;
   * production requires a remote URL.
   */
  localUrl?: string;
  /** Identifier passed to Mastra; also used in error messages. */
  id?: string;
};

export type AiVectorStoreContext = {
  env?: Record<string, string | undefined>;
  /** Main app database URL; the vector store must not share its file. */
  databaseUrl?: string;
};

const DEFAULT_LOCAL_URL = "file:./vector.db";

function localPath(url: string): string | undefined {
  return url.startsWith("file:") ? url.slice("file:".length).replace(/^\/\//, "") : undefined;
}

export function createAiVectorStore(
  config: AiVectorStoreConfig = {},
  context: AiVectorStoreContext = {}
): LibSQLVector {
  const env = context.env ?? (process.env as Record<string, string | undefined>);
  const id = config.id ?? "ai-vector";

  if (config.url) {
    return new LibSQLVector({
      id,
      url: config.url,
      authToken: config.authToken,
    });
  }

  if (env.NODE_ENV === "production") {
    throw new Error(
      `AI vector store "${id}" requires a remote url in production; local vector files are dev-only`
    );
  }

  const url = config.localUrl ?? DEFAULT_LOCAL_URL;
  const filePath = localPath(url);
  if (!filePath) {
    throw new Error(
      `AI vector store "${id}" localUrl must be a file: URL (got "${url}"); use "url" for remote databases`
    );
  }

  const databaseUrl = context.databaseUrl ?? env.DATABASE_URL;
  const databasePath = databaseUrl ? localPath(databaseUrl) : undefined;
  if (databasePath && databasePath === filePath) {
    throw new Error(
      `AI vector store "${id}" must not share the app database file "${databaseUrl}"; ` +
        "two libsql clients on one file corrupt the WAL. Point it at its own file (e.g. file:./vector.db)"
    );
  }

  return new LibSQLVector({ id, url });
}
