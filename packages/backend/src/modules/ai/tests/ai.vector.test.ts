import { PgVector, PostgresStore } from "@mastra/pg";
import { createTestPool } from "../../../test/postgresql";
import { AiVectorRepository } from "../ai.repository";
import { createAiVectorStore } from "../ai.vector";

const namespace = `vector_test_${process.pid}`;

describe("PostgreSQL embedding persistence", () => {
  const pool = createTestPool();
  let provisioner: PgVector;
  let runtime: PgVector;

  beforeAll(async () => {
    await pool.query(`CREATE SCHEMA "${namespace}"`);
    provisioner = new PgVector({
      id: "provision",
      connectionString: process.env.TEST_DATABASE_DIRECT_URL!,
      schemaName: namespace,
    });
    await provisioner.createIndex({
      indexName: "mastra_embeddings",
      dimension: 3,
      metric: "cosine",
      buildIndex: false,
    });
    runtime = createAiVectorStore({
      connectionString: process.env.TEST_DATABASE_URL,
      schemaName: namespace,
    });
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE "${namespace}".mastra_embeddings`);
  });

  afterAll(async () => {
    await runtime?.disconnect();
    await provisioner?.disconnect();
    await pool.query(`DROP SCHEMA "${namespace}" CASCADE`);
    await pool.end();
  });

  it("rejects removed local-file configuration", () => {
    expect(() => createAiVectorStore({ connectionString: "file:./vector.db" })).toThrow(
      /PostgreSQL/
    );
  });

  it("persists embeddings with metadata through the runtime connection", async () => {
    const repository = new AiVectorRepository(runtime);
    const result = await repository.upsertEmbeddings({
      indexName: "mastra_embeddings",
      embed: { embeddings: [[1, 0, 0]], chunks: [{ text: 'quote " and \\ and %' }] },
      metadata: { userId: "personal-user", document: { kind: "example" } },
    });
    expect(result.isOk()).toBe(true);
    expect((await runtime.describeIndex({ indexName: "mastra_embeddings" })).count).toBe(1);
    const matches = await runtime.query({
      indexName: "mastra_embeddings",
      queryVector: [1, 0, 0],
      topK: 1,
    });
    expect(matches[0]?.metadata).toEqual({
      userId: "personal-user",
      document: { kind: "example" },
      text: 'quote " and \\ and %',
    });
  });

  it("rejects dimension mismatches without losing existing vectors", async () => {
    const repository = new AiVectorRepository(runtime);
    await runtime.upsert({
      indexName: "mastra_embeddings",
      vectors: [[1, 0, 0]],
      ids: ["preserved"],
    });
    const result = await repository.upsertEmbeddings({
      indexName: "mastra_embeddings",
      embed: { embeddings: [[1, 0]], chunks: [{ text: "invalid" }] },
    });
    expect(result.isErr()).toBe(true);
    expect((await runtime.describeIndex({ indexName: "mastra_embeddings" })).count).toBe(1);
  });

  it("keeps personal Threads durable across storage restart and resource-scoped", async () => {
    const provisionerStorage = new PostgresStore({
      id: "thread-init",
      connectionString: process.env.TEST_DATABASE_DIRECT_URL!,
      schemaName: namespace,
    });
    try {
      await provisionerStorage.init();
      const memory = await provisionerStorage.getStore("memory");
      await memory!.saveThread({
        thread: {
          id: "conversation-1",
          resourceId: "user-1",
          title: "Durable conversation",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
      });
      await memory!.saveMessages({
        messages: [
          {
            id: "message-1",
            threadId: "conversation-1",
            resourceId: "user-1",
            role: "user",
            createdAt: new Date("2026-01-01T00:00:00Z"),
            content: { format: 2, parts: [{ type: "text", text: "Persisted across restart" }] },
          },
        ],
      });
    } finally {
      await provisionerStorage.close();
    }
    const restarted = new PostgresStore({
      id: "thread-runtime",
      connectionString: process.env.TEST_DATABASE_URL!,
      schemaName: namespace,
      disableInit: true,
    });
    try {
      const memory = await restarted.getStore("memory");
      expect(
        await memory!.getThreadById({ threadId: "conversation-1", resourceId: "user-1" })
      ).toMatchObject({
        id: "conversation-1",
        resourceId: "user-1",
        title: "Durable conversation",
      });
      expect(
        await memory!.getThreadById({ threadId: "conversation-1", resourceId: "other-user" })
      ).toBeNull();
      expect(
        (await memory!.listMessages({ threadId: "conversation-1", resourceId: "user-1" })).messages
      ).toMatchObject([
        { id: "message-1", content: { parts: [{ text: "Persisted across restart" }] } },
      ]);
      expect(
        (await memory!.listMessages({ threadId: "conversation-1", resourceId: "other-user" }))
          .messages
      ).toEqual([]);
    } finally {
      await restarted.close();
    }
  });
});
