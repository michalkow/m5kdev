import { Avatar, Button, EmptyState, Input, Label, TextField } from "@heroui/react";
import { useAiChat } from "@m5kdev/frontend/modules/ai/hooks/useAiChat";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { Sparkles } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Markdown from "react-markdown";
import { AiConversationProvider, useAiConversation } from "./aiConversation.context";

export interface AiConversationProps {
  readonly threadId: string;
  readonly agentId: string;
  readonly children?: ReactNode;
}

function AiConversationRoot({ threadId, agentId, children }: AiConversationProps) {
  const chat = useAiChat({ agentId, threadId });
  return (
    <AiConversationProvider value={{ ...chat, threadId, agentId }}>
      <div className="flex h-full min-h-0 w-full flex-col">
        {children ?? (
          <>
            <AiConversationMessages />
            <AiConversationPrompt />
          </>
        )}
      </div>
    </AiConversationProvider>
  );
}

function messageText(message: { parts: ReadonlyArray<{ type: string; text?: string }> }): string {
  return message.parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("");
}

function isBusyStatus(status: string): boolean {
  return status === "submitted" || status === "streaming";
}

function AiConversationMessages() {
  const { messages, status, error } = useAiConversation();
  const { t } = useTranslation("web-ui");
  const { data: session } = useSession();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const userName = session?.user?.name ?? "";
  const userImage = session?.user?.image ?? undefined;
  const last = messages[messages.length - 1];
  const waitingForAssistant =
    isBusyStatus(status) &&
    (last === undefined || last.role !== "assistant" || messageText(last).length === 0);

  const stickToBottomKey = `${messages.length}:${status}`;

  useEffect(() => {
    if (!isAtBottom) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
    void stickToBottomKey;
  }, [isAtBottom, stickToBottomKey]);

  if (messages.length === 0 && !waitingForAssistant && !error) {
    return (
      <EmptyState className="flex h-full w-full flex-col items-center justify-center gap-4 py-10 text-center">
        <span className="text-sm text-muted-foreground">{t("ai.conversation.empty")}</span>
      </EmptyState>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        className="flex h-full flex-col gap-4 overflow-y-auto p-4"
        onScroll={(event) => {
          const el = event.currentTarget;
          setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
        }}
      >
        {messages.map((message) => {
          const text = messageText(message);
          if (message.role === "user") {
            return (
              <div key={message.id} data-role="user" className="flex justify-end gap-2">
                <div className="max-w-[80%] rounded-2xl bg-accent px-3 py-2 text-sm text-accent-foreground">
                  {text}
                </div>
                <Avatar
                  size="sm"
                  className="shrink-0"
                  aria-label={userName || t("ai.conversation.user")}
                >
                  {userImage ? <Avatar.Image src={userImage} alt={userName} /> : null}
                  <Avatar.Fallback>{userName.slice(0, 1) || "U"}</Avatar.Fallback>
                </Avatar>
              </div>
            );
          }
          return (
            <div key={message.id} data-role="assistant" className="flex items-start gap-2">
              <Avatar size="sm" className="shrink-0" aria-label={t("ai.conversation.assistant")}>
                <Avatar.Fallback>
                  <Sparkles className="size-4" />
                </Avatar.Fallback>
              </Avatar>
              <div className="prose prose-sm max-w-[80%] text-sm">
                <Markdown>{text}</Markdown>
              </div>
            </div>
          );
        })}
        {waitingForAssistant ? (
          <p className="text-sm text-muted-foreground">{t("ai.conversation.streaming")}</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {t("ai.conversation.error")}
          </p>
        ) : null}
        <div ref={bottomRef} />
      </div>
      {!isAtBottom ? (
        <Button
          type="button"
          size="sm"
          className="absolute bottom-3 left-1/2 -translate-x-1/2"
          onPress={() => {
            bottomRef.current?.scrollIntoView({ block: "end" });
            setIsAtBottom(true);
          }}
        >
          {t("ai.conversation.jumpToBottom")}
        </Button>
      ) : null}
    </div>
  );
}

function AiConversationPrompt() {
  const { sendMessage, stop, status } = useAiConversation();
  const { t } = useTranslation("web-ui");
  const [text, setText] = useState("");
  const busy = isBusyStatus(status);

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    void sendMessage({ text: trimmed });
    setText("");
  }

  return (
    <form className="flex shrink-0 items-end gap-2 border-t p-3" onSubmit={onSubmit}>
      <TextField
        className="min-w-0 flex-1"
        value={text}
        onChange={setText}
        name="conversation-prompt"
      >
        <Label className="sr-only">{t("ai.conversation.prompt")}</Label>
        <Input placeholder={t("ai.conversation.prompt")} />
      </TextField>
      {busy ? (
        <Button type="button" onPress={() => void stop()}>
          {t("ai.conversation.stop")}
        </Button>
      ) : (
        <Button type="submit">{t("ai.conversation.send")}</Button>
      )}
    </form>
  );
}

export const AiConversation = Object.assign(AiConversationRoot, {
  Messages: AiConversationMessages,
  Prompt: AiConversationPrompt,
});
