import { useAiChat } from "@m5kdev/frontend/modules/ai/hooks/useAiChat";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AiConversation } from "./AiConversation";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children?: ReactNode }) => <div data-markdown="true">{children}</div>,
}));

jest.mock(
  "@heroui/react",
  () => {
    function Button({ children, ...props }: { children?: ReactNode; type?: string }) {
      return <button {...props}>{children}</button>;
    }
    function Avatar({ children, ...props }: { children?: ReactNode; "aria-label"?: string }) {
      return <div data-avatar={props["aria-label"] ?? ""}>{children}</div>;
    }
    Avatar.Image = ({ src, alt }: { src?: string; alt?: string }) => <img src={src} alt={alt} />;
    Avatar.Fallback = ({ children }: { children?: ReactNode }) => <span>{children}</span>;
    return {
      EmptyState: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
      Button,
      Avatar,
      TextField: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
      Input: (props: { placeholder?: string }) => <input {...props} />,
      Label: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
      Disclosure: Object.assign(({ children }: { children?: ReactNode }) => <div>{children}</div>, {
        Heading: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
        Trigger: ({ children }: { children?: ReactNode }) => (
          <button type="button">{children}</button>
        ),
        Indicator: () => <span />,
        Content: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
      }),
    };
  },
  { virtual: true }
);

jest.mock(
  "@m5kdev/frontend/modules/ai/hooks/useAiChat",
  () => ({
    useAiChat: jest.fn(),
  }),
  { virtual: true }
);

jest.mock(
  "@m5kdev/frontend/modules/auth/hooks/useSession",
  () => ({
    useSession: () => ({
      data: { user: { name: "Ada Lovelace", image: "https://img.test/ada.png" } },
      isLoading: false,
    }),
  }),
  { virtual: true }
);

const mockedUseAiChat = useAiChat as unknown as jest.Mock;

const userMessage = {
  id: "u1",
  role: "user" as const,
  parts: [{ type: "text" as const, text: "Hello there" }],
};

const assistantMessage = {
  id: "a1",
  role: "assistant" as const,
  parts: [{ type: "text" as const, text: "A **markdown** reply" }],
};

const assistantWithTools = {
  id: "a2",
  role: "assistant" as const,
  parts: [
    { type: "text" as const, text: "I'll look that up." },
    {
      type: "tool-search",
      toolCallId: "call-search",
      state: "output-available",
      input: { q: "docs" },
      output: { hits: 2 },
    },
    {
      type: "tool-secret",
      toolCallId: "call-secret",
      state: "output-available",
      input: { x: 1 },
      output: { y: 2 },
    },
  ],
};

describe("AiConversation", () => {
  beforeEach(() => {
    mockedUseAiChat.mockReturnValue({
      messages: [],
      status: "ready",
      error: undefined,
      sendMessage: jest.fn(),
      stop: jest.fn(),
    });
  });

  it("shows the empty state when the Conversation has no turns", () => {
    const markup = renderToStaticMarkup(
      <AiConversation threadId="thread-1" agentId="writer">
        <AiConversation.Messages />
      </AiConversation>
    );
    expect(markup).toContain("ai.conversation.empty");
  });

  it("allows omitting Prompt for a read-only transcript", () => {
    const markup = renderToStaticMarkup(
      <AiConversation threadId="thread-1" agentId="writer">
        <AiConversation.Messages />
      </AiConversation>
    );
    expect(markup).not.toContain("ai.conversation.prompt");
    expect(markup).not.toContain("ai.conversation.send");
  });

  it("renders Messages and Prompt by default", () => {
    const markup = renderToStaticMarkup(<AiConversation threadId="thread-1" agentId="writer" />);
    expect(markup).toContain("ai.conversation.empty");
    expect(markup).toContain("ai.conversation.send");
  });

  it("renders a user bubble and an assistant markdown row from stub messages", () => {
    mockedUseAiChat.mockReturnValue({
      messages: [userMessage, assistantMessage],
      status: "ready",
      error: undefined,
      sendMessage: jest.fn(),
      stop: jest.fn(),
    });

    const markup = renderToStaticMarkup(
      <AiConversation threadId="thread-1" agentId="writer">
        <AiConversation.Messages />
      </AiConversation>
    );

    expect(markup).toContain('data-role="user"');
    expect(markup).toContain("Hello there");
    expect(markup).toContain("https://img.test/ada.png");
    expect(markup).toContain('data-role="assistant"');
    expect(markup).toContain('data-markdown="true"');
    expect(markup).toContain("A **markdown** reply");
    expect(markup).toContain("ai.conversation.assistant");
  });

  it("shows a streaming placeholder while waiting for the assistant", () => {
    mockedUseAiChat.mockReturnValue({
      messages: [userMessage],
      status: "submitted",
      error: undefined,
      sendMessage: jest.fn(),
      stop: jest.fn(),
    });

    const markup = renderToStaticMarkup(
      <AiConversation threadId="thread-1" agentId="writer">
        <AiConversation.Messages />
      </AiConversation>
    );
    expect(markup).toContain("ai.conversation.streaming");
  });

  it("shows a stream error", () => {
    mockedUseAiChat.mockReturnValue({
      messages: [userMessage],
      status: "error",
      error: new Error("stream failed"),
      sendMessage: jest.fn(),
      stop: jest.fn(),
    });

    const markup = renderToStaticMarkup(
      <AiConversation threadId="thread-1" agentId="writer">
        <AiConversation.Messages />
      </AiConversation>
    );
    expect(markup).toContain("ai.conversation.error");
  });

  it("shows stop while streaming", () => {
    mockedUseAiChat.mockReturnValue({
      messages: [userMessage],
      status: "streaming",
      error: undefined,
      sendMessage: jest.fn(),
      stop: jest.fn(),
    });

    const markup = renderToStaticMarkup(
      <AiConversation threadId="thread-1" agentId="writer">
        <AiConversation.Prompt />
      </AiConversation>
    );
    expect(markup).toContain("ai.conversation.stop");
    expect(markup).not.toContain("ai.conversation.send");
  });

  it("shows tool parts by default", () => {
    mockedUseAiChat.mockReturnValue({
      messages: [userMessage, assistantWithTools],
      status: "ready",
      error: undefined,
      sendMessage: jest.fn(),
      stop: jest.fn(),
    });

    const markup = renderToStaticMarkup(
      <AiConversation threadId="thread-1" agentId="writer">
        <AiConversation.Messages />
      </AiConversation>
    );

    expect(markup).toContain('data-tool-name="search"');
    expect(markup).toContain('data-tool-name="secret"');
    expect(markup).toContain("ai.conversation.tool.args");
    expect(markup).toContain("ai.conversation.tool.result");
    expect(markup).toContain("ai.conversation.tool.status.complete");
    expect(markup).toContain("&quot;q&quot;:&quot;docs&quot;");
    expect(markup).toContain("&quot;hits&quot;:2");
  });

  it("hides all tool parts when showToolCalls is false", () => {
    mockedUseAiChat.mockReturnValue({
      messages: [userMessage, assistantWithTools],
      status: "ready",
      error: undefined,
      sendMessage: jest.fn(),
      stop: jest.fn(),
    });

    const markup = renderToStaticMarkup(
      <AiConversation threadId="thread-1" agentId="writer" showToolCalls={false}>
        <AiConversation.Messages />
      </AiConversation>
    );

    expect(markup).toContain("look that up.");
    expect(markup).not.toContain('data-tool-name="search"');
    expect(markup).not.toContain('data-tool-name="secret"');
  });

  it("allowlists tool names when showToolCalls is a string array", () => {
    mockedUseAiChat.mockReturnValue({
      messages: [userMessage, assistantWithTools],
      status: "ready",
      error: undefined,
      sendMessage: jest.fn(),
      stop: jest.fn(),
    });

    const markup = renderToStaticMarkup(
      <AiConversation threadId="thread-1" agentId="writer" showToolCalls={["search"]}>
        <AiConversation.Messages />
      </AiConversation>
    );

    expect(markup).toContain('data-tool-name="search"');
    expect(markup).not.toContain('data-tool-name="secret"');
  });
});
