import { Button, FieldError, Form, Input, Label, TextArea, TextField } from "@heroui/react";
import { useSupport } from "@m5kdev/frontend/modules/support/hooks/useSupport";
import { useTranslation } from "react-i18next";
import { SupportMessageList } from "./SupportMessageList";

export function SupportPanel({ admin = false }: { admin?: boolean }) {
  const { t } = useTranslation("web-ui");
  const state = useSupport();
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const body = String(values.get("body") ?? "");
    const success = state.selectedId
      ? await state.sendMessage(body)
      : await state.createCase(
          String(values.get("subject") ?? ""),
          body,
          admin ? String(values.get("userId") ?? "") : undefined
        );
    if (success) form.reset();
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
            {item.subject}
          </Button>
        ))}
      </nav>
      {state.transcript && <SupportMessageList messages={state.transcript.messages} />}
      <Form onSubmit={submit} className="grid gap-3">
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
          <TextArea rows={3} />
          <FieldError />
        </TextField>
        <Button type="submit" isDisabled={state.isPending} variant="primary">
          {t(state.isPending ? "support.sending" : "support.send")}
        </Button>
      </Form>
    </section>
  );
}
