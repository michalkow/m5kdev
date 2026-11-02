import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import { createServiceActor } from "../../../base/base.actor";
import { createTestPool } from "../../../test/postgresql";
import { AIService } from "../ai.service";

jest.mock("@mastra/ai-sdk", () => ({ handleChatStream: jest.fn() }));
jest.mock("ai", () => ({}));

const namespace = `memory_test_${process.pid}`;

describe("Conversation with PostgreSQL Agent Memory", () => {
  const pool = createTestPool();
  let storage: PostgresStore;

  beforeAll(async () => {
    storage = new PostgresStore({
      id: "memory-init",
      connectionString: process.env.TEST_DATABASE_DIRECT_URL!,
      schemaName: namespace,
    });
    await storage.init();
  });

  afterAll(async () => {
    await storage.close();
    await pool.query(`DROP SCHEMA "${namespace}" CASCADE`);
    await pool.end();
  });

  function service(): AIService {
    const agent = new Agent({
      id: "assistant",
      name: "Assistant",
      instructions: "Test",
      model: "openai/gpt-4o-mini",
      memory: new Memory({ storage, options: { semanticRecall: false } }),
    });
    return new AIService({}, {}, { mastra: new Mastra({ agents: { assistant: agent }, storage }) });
  }

  it("hydrates a fresh Conversation without creating a Thread", async () => {
    const result = await service().recallThreadMessages({
      actor: createServiceActor({ userId: "new-user", userRole: "user" }),
      agentId: "assistant",
      threadId: "fresh",
    });
    if (result.isErr()) throw result.error;
    expect(result.value).toEqual({ messages: [], memory: true });
    expect(
      await (await storage.getStore("memory"))!.getThreadById({ threadId: "fresh" })
    ).toBeNull();
  });

  it("recalls durable messages after reconnect and rejects a foreign resource", async () => {
    const memory = await storage.getStore("memory");
    await memory!.saveThread({
      thread: {
        id: "persisted",
        resourceId: "owner",
        title: "History",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await memory!.saveMessages({
      messages: [
        {
          id: "durable",
          threadId: "persisted",
          resourceId: "owner",
          role: "user",
          createdAt: new Date(),
          content: { format: 2, parts: [{ type: "text", text: "Durable history" }] },
        },
      ],
    });
    await storage.close();
    storage = new PostgresStore({
      id: "memory-runtime",
      connectionString: process.env.TEST_DATABASE_URL!,
      schemaName: namespace,
      disableInit: true,
    });
    const ai = service();
    const own = await ai.recallThreadMessages({
      actor: createServiceActor({ userId: "owner", userRole: "user" }),
      agentId: "assistant",
      threadId: "persisted",
    });
    if (own.isErr()) throw own.error;
    expect(own.value.messages).toMatchObject([
      { id: "durable", parts: [{ type: "text", text: "Durable history" }] },
    ]);
    const foreign = await ai.recallThreadMessages({
      actor: createServiceActor({ userId: "intruder", userRole: "user" }),
      agentId: "assistant",
      threadId: "persisted",
    });
    expect(foreign.isErr()).toBe(true);
    const write = await ai.streamChat({
      actor: createServiceActor({ userId: "intruder", userRole: "user" }),
      agentId: "assistant",
      threadId: "persisted",
      messages: [],
    });
    expect(write.isErr()).toBe(true);
  });
});
