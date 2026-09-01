import { hydrateConversation } from "./hydrateConversation";

describe("hydrateConversation", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches the Thread with credentials included", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [], memory: false }),
    });
    globalThis.fetch = fetchImpl as typeof fetch;

    const result = await hydrateConversation({
      serverUrl: "http://server.test",
      agentId: "writer",
      threadId: "thread-1",
    });

    expect(fetchImpl).toHaveBeenCalledWith("http://server.test/ai/chat/writer/threads/thread-1", {
      credentials: "include",
    });
    expect(result).toEqual({ messages: [], memory: false });
  });
});
