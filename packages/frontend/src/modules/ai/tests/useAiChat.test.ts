import { getOrCreateAiChat, setConversationHasMemory } from "./useAiChat";

interface TransportInit {
  readonly api: string;
  readonly body?: unknown;
  readonly prepareSendMessagesRequest?: (options: { messages: unknown[]; body?: unknown }) => {
    body: unknown;
  };
}

class MockChat {
  constructor(public readonly init: { transport: { init: TransportInit } }) {}
}

jest.mock("@ai-sdk/react", () => ({
  Chat: class Chat {
    constructor(public readonly init: { transport: { init: TransportInit } }) {}
  },
  useChat: jest.fn(),
}));

jest.mock("ai", () => ({
  DefaultChatTransport: class DefaultChatTransport {
    constructor(public readonly init: TransportInit) {}
  },
}));

jest.mock("./hydrateConversation", () => ({
  hydrateConversation: jest.fn(),
}));

function asMockChat(chat: unknown): MockChat {
  if (chat instanceof MockChat) return chat;
  if (typeof chat === "object" && chat !== null && "init" in chat) {
    return chat as MockChat;
  }
  throw new Error("expected a Chat with transport init");
}

describe("getOrCreateAiChat", () => {
  it("reuses one Chat for the same agentId and threadId after another mount", () => {
    const first = getOrCreateAiChat({
      serverUrl: "http://server.test",
      agentId: "writer",
      threadId: "thread-shared",
    });
    const second = getOrCreateAiChat({
      serverUrl: "http://server.test",
      agentId: "writer",
      threadId: "thread-shared",
    });

    expect(second).toBe(first);
  });

  it("does not evict the Chat when the last mount goes away", () => {
    const created = getOrCreateAiChat({
      serverUrl: "http://server.test",
      agentId: "writer",
      threadId: "thread-persist",
    });

    const afterUnmount = getOrCreateAiChat({
      serverUrl: "http://server.test",
      agentId: "writer",
      threadId: "thread-persist",
    });

    expect(afterUnmount).toBe(created);
  });

  it("sends the full in-memory history on POST", () => {
    const chat = asMockChat(
      getOrCreateAiChat({
        serverUrl: "http://server.test",
        agentId: "writer",
        threadId: "thread-history",
      })
    );
    const history = [
      { id: "1", role: "user", parts: [{ type: "text", text: "Hi" }] },
      { id: "2", role: "assistant", parts: [{ type: "text", text: "Hello" }] },
      { id: "3", role: "user", parts: [{ type: "text", text: "More" }] },
    ];
    const prepared = chat.init.transport.init.prepareSendMessagesRequest?.({
      messages: history,
      body: { threadId: "thread-history" },
    });

    expect(chat.init.transport.init.api).toBe("http://server.test/ai/chat/writer");
    expect(prepared?.body).toEqual({
      threadId: "thread-history",
      messages: history,
    });
  });

  it("sends only the last user message and memory.thread when Memory is on", () => {
    setConversationHasMemory({
      agentId: "writer",
      threadId: "thread-memory",
      memory: true,
    });
    const chat = asMockChat(
      getOrCreateAiChat({
        serverUrl: "http://server.test",
        agentId: "writer",
        threadId: "thread-memory",
      })
    );
    const history = [
      { id: "1", role: "user" as const, parts: [{ type: "text" as const, text: "Hi" }] },
      { id: "2", role: "assistant" as const, parts: [{ type: "text" as const, text: "Hello" }] },
      { id: "3", role: "user" as const, parts: [{ type: "text" as const, text: "More" }] },
    ];
    const prepared = chat.init.transport.init.prepareSendMessagesRequest?.({
      messages: history,
      body: { threadId: "thread-memory" },
    });

    expect(prepared?.body).toEqual({
      threadId: "thread-memory",
      messages: [history[2]],
      memory: { thread: "thread-memory" },
    });
  });
});
