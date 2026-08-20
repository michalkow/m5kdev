import { Avatar, Button, Disclosure, EmptyState, Input, Label, TextField } from "@heroui/react";
import { useAiChat } from "@m5kdev/frontend/modules/ai/hooks/useAiChat";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { Sparkles } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Markdown from "react-markdown";
import {
  AiConversationProvider,
  type ShowToolCalls,
  useAiConversation,
} from "./aiConversation.context";

export type { ShowToolCalls };

export interface AiConversationProps {
  readonly threadId: string;
  readonly agentId: string;
  readonly children?: ReactNode;
  readonly showToolCalls?: ShowToolCalls;
}

function AiConversationRoot({
  threadId,
  agentId,
  children,
  showToolCalls = true,
}: AiConversationProps) {
  const chat = useAiChat({ agentId, threadId });
  return (
    <AiConversationProvider value={{ ...chat, threadId, agentId, showToolCalls }}>
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

interface ConversationPart {
  readonly type: string;
  readonly text?: string;
  readonly toolName?: string;
  readonly toolCallId?: string;
  readonly state?: string;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly errorText?: string;
}

function toolNameFromPart(part: ConversationPart): string | undefined {
  if (part.type === "dynamic-tool" && typeof part.toolName === "string") {
    return part.toolName;
  }
  if (part.type.startsWith("tool-")) {
    return part.type.slice("tool-".length);
  }
  return undefined;
}

function shouldShowTool(name: string, showToolCalls: ShowToolCalls): boolean {
  if (showToolCalls === false) return false;
  if (showToolCalls === true) return true;
  return showToolCalls.includes(name);
}

function toolStatusKey(state: string | undefined): string {
  if (state === "output-available") return "ai.conversation.tool.status.complete";
  if (state === "output-error") return "ai.conversation.tool.status.error";
  return "ai.conversation.tool.status.running";
}

function jsonPreview(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function ConversationToolPart({ part, name }: { part: ConversationPart; name: string }) {
  const { t } = useTranslation("web-ui");
  return (
    <Disclosure defaultExpanded className="not-prose my-2 rounded-md border text-sm">
      <Disclosure.Heading>
        <Disclosure.Trigger>
          <span data-tool-name={name}>{name}</span>
          <span>{t(toolStatusKey(part.state))}</span>
          <Disclosure.Indicator />
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <div>
          <p>{t("ai.conversation.tool.args")}</p>
          <pre>{jsonPreview(part.input)}</pre>
        </div>
        <div>
          <p>{t("ai.conversation.tool.result")}</p>
          <pre>{part.errorText ?? jsonPreview(part.output)}</pre>
        </div>
      </Disclosure.Content>
    </Disclosure>
  );
}

function assistantParts(parts: ReadonlyArray<ConversationPart>, showToolCalls: ShowToolCalls) {
  return parts.map((part) => {
    if (part.type === "text" && typeof part.text === "string") {
      return <Markdown key={`text:${part.text}`}>{part.text}</Markdown>;
    }
    const name = toolNameFromPart(part);
    if (!name || !shouldShowTool(name, showToolCalls)) return null;
    return <ConversationToolPart key={part.toolCallId ?? `tool:${name}`} part={part} name={name} />;
  });
}

function AiConversationMessages() {
  const { messages, status, error, showToolCalls } = useAiConversation();
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
                {assistantParts(message.parts, showToolCalls)}
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
