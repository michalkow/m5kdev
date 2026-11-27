import { Button, FieldError, Form, Input, Label, TextArea, TextField } from "@heroui/react";
import { useSupport } from "@m5kdev/frontend/modules/support/hooks/useSupport";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SupportDeskTools } from "./SupportDeskTools";
import { SupportMessageList } from "./SupportMessageList";

export function SupportPanel({ admin = false }: { admin?: boolean }) {
  const { t } = useTranslation("web-ui");
  const state = useSupport(admin);
  const [savedReply, setSavedReply] = useState<{ id: string; body: string } | null>(null);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const body = String(values.get("body") ?? "");
    const success = state.selectedId
      ? await state.sendMessage(body, values.get("internal") === "true" ? "internal" : "public")
      : await state.createCase(
          String(values.get("subject") ?? ""),
          body,
          admin ? String(values.get("userId") ?? "") : undefined
        );
    if (success) {
      form.reset();
      setSavedReply(null);
    }
  };
  return (
    <section
      aria-label={t(admin ? "support.desk" : "support.title")}
      className="flex min-h-80 flex-col gap-4 p-4"
    >
      <header className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">{t(admin ? "support.desk" : "support.title")}</h2>
        <Button size="sm" variant="secondary" onPress={() => state.selectCase(null)}>
          {t("support.new")}
        </Button>
      </header>
      {state.error && (
        <div role="alert" className="rounded-lg border border-danger p-3 text-sm">
          {t("support.failed")}{" "}
          <Button size="sm" variant="tertiary" onPress={() => void state.retry()}>
            {t("support.retry")}
          </Button>
        </div>
      )}
      {admin && <SupportDeskTools state={state} onChooseReply={setSavedReply} />}
      {state.isLoading && <p role="status">{t("support.loading")}</p>}
      <nav
        aria-label={t("support.requests")}
        className="flex max-h-36 flex-col gap-1 overflow-y-auto border-b border-border pb-3"
      >
        {state.cases.length === 0 && !state.isLoading && (
          <p className="text-sm text-muted">{t("support.empty")}</p>
        )}
        {state.cases.map((item) => (
          <Button
            key={item.id}
            variant={item.id === state.selectedId ? "secondary" : "tertiary"}
            className="justify-start"
            onPress={() => state.selectCase(item.id)}
          >
            {item.subject} {item.unreadCount > 0 && <span>({item.unreadCount})</span>}
          </Button>
        ))}
      </nav>
      {state.transcript && state.transcript.case.unreadCount > 0 && (
        <Button size="sm" variant="secondary" onPress={() => void state.markRead()}>
          {t("support.markRead")}
        </Button>
      )}
      {state.transcript && <SupportMessageList messages={state.transcript.messages} />}
      <div className="flex gap-2">
        {state.transcript?.hasOlder && (
          <Button size="sm" variant="tertiary" onPress={state.showOlder}>
            {t("support.older")}
          </Button>
        )}
        {state.isHistory && (
          <Button size="sm" variant="tertiary" onPress={state.showLatest}>
            {t("support.latest")}
          </Button>
        )}
      </div>
      {state.transcript && (
        <Button
          size="sm"
          variant="secondary"
          onPress={() =>
            void state.updateCase({
              status: state.transcript?.case.status === "resolved" ? "open" : "resolved",
            })
          }
        >
          {t(state.transcript.case.status === "resolved" ? "support.reopen" : "support.resolve")}
        </Button>
      )}
      <Form key={savedReply?.id ?? "new"} onSubmit={submit} className="grid gap-3">
        {!state.selectedId && (
          <>
            {admin && (
              <TextField name="userId" isRequired>
                <Label>{t("support.userId")}</Label>
                <Input />
                <FieldError />
              </TextField>
            )}
            <TextField name="subject" isRequired maxLength={200}>
              <Label>{t("support.subject")}</Label>
              <Input />
              <FieldError />
            </TextField>
          </>
        )}
        <TextField name="body" isRequired maxLength={20000}>
          <Label>{t("support.message")}</Label>
          <TextArea rows={3} defaultValue={savedReply?.body} />
          <FieldError />
        </TextField>
        {admin && state.selectedId && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="internal" value="true" />
            {t("support.internalNote")}
          </label>
        )}
        <Button type="submit" isDisabled={state.isPending} variant="primary">
          {t(state.isPending ? "support.sending" : "support.send")}
        </Button>
      </Form>
    </section>
  );
}
