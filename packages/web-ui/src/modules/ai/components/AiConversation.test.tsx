import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AiConversation } from "./AiConversation";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock(
  "@heroui/react",
  () => ({
    EmptyState: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  }),
  { virtual: true }
);

jest.mock(
  "@m5kdev/frontend/modules/ai/hooks/useAiChat",
  () => ({
    useAiChat: () => ({
      messages: [],
    }),
  }),
  { virtual: true }
);

describe("AiConversation.Messages", () => {
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
  });
});
