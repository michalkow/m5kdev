import {
  Button,
  Checkbox,
  FieldError,
  Form,
  Input,
  Label,
  TextArea,
  TextField,
} from "@heroui/react";
import { useSupport } from "@m5kdev/frontend/modules/support/hooks/useSupport";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SupportDeskTools } from "./SupportDeskTools";
import { SupportMessageList } from "./SupportMessageList";
import { SupportOverview } from "./SupportOverview";
import { SupportSettings } from "./SupportSettings";

export function SupportPanel({ admin = false }: { admin?: boolean }) {
  const { t } = useTranslation("web-ui");
  const state = useSupport(admin);
  const [noteMode, setNoteMode] = useState<{ caseId: string | null; value: boolean }>({
    caseId: null,
    value: false,
  });
  const internalNote = noteMode.caseId === state.selectedId && noteMode.value;
  const setInternalNote = (value: boolean) => setNoteMode({ caseId: state.selectedId, value });
  const [savedReply, setSavedReply] = useState<{
    id: string;
    body: string;
    caseId: string | null;
  } | null>(null);
  const selectedReply = savedReply?.caseId === state.selectedId ? savedReply : null;
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const body = String(values.get("body") ?? "");
    const success = state.selectedId
      ? await state.sendMessage(
          body,
          internalNote ? "internal" : "public",
          values.get("preview") === "true"
        )
      : await state.createCase(
          String(values.get("subject") ?? ""),
          body,
          admin ? String(values.get("userId") ?? "") : undefined
        );
    if (success) {
      form.reset();
      setSavedReply(null);
      setInternalNote(false);
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
      {state.availability && (
        <div className="grid gap-1 text-xs text-muted">
          <p>{state.availability.replyExpectation}</p>
          {state.availability.openNow !== null && (
            <p>{t(state.availability.openNow ? "support.hours.open" : "support.hours.closed")}</p>
          )}
          {state.availability.calendar && (
            <>
              <p>{state.availability.calendar.timeZone}</p>
              {state.availability.calendar.weekly.map((window, index) => (
                <p key={`${window.day}-${index}`}>
                  {t(`support.day.${window.day}`)} {window.opens}–{window.closes}
                </p>
              ))}
            </>
          )}
        </div>
      )}
      {state.error && (
        <div role="alert" className="rounded-lg border border-danger p-3 text-sm">
          {t("support.failed")}{" "}
          <Button size="sm" variant="tertiary" onPress={() => void state.retry()}>
            {t("support.retry")}
          </Button>
        </div>
      )}
      {admin && <SupportOverview state={state} />}
      {admin && <SupportSettings state={state} />}
      {admin && (
        <SupportDeskTools
          state={state}
          onChooseReply={(reply) => setSavedReply({ ...reply, caseId: state.selectedId })}
        />
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
            {item.subject || t("support.title")}{" "}
            {item.unreadCount > 0 && <span>({item.unreadCount})</span>}
          </Button>
        ))}
      </nav>
      {state.hasMoreCases && (
        <Button size="sm" variant="tertiary" onPress={state.loadMoreCases}>
          {t("support.moreCases")}
        </Button>
      )}
      {state.transcript && (
        <p role="status" className="text-sm text-muted">
          {t(
            state.transcript.case.handling === "ai"
              ? "support.handling.ai"
              : "support.handling.human"
          )}
        </p>
      )}
      {state.transcript && state.transcript.case.unreadCount > 0 && (
        <Button size="sm" variant="secondary" onPress={() => void state.markRead()}>
          {t("support.markRead")}
        </Button>
      )}
      {state.transcript && (
        <SupportMessageList
          messages={state.transcript.messages}
          onDownload={state.downloadFile}
          onRedact={admin ? state.redactMessage : undefined}
          onTranslate={admin ? state.translateMessage : undefined}
          onControl={admin ? state.controlMessage : undefined}
        />
      )}
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
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onPress={state.requestHuman}>
            {t("support.talkToPerson")}
          </Button>
          {admin && state.settings?.ai.enabled && state.transcript.case.handling === "human" && (
            <Button size="sm" onPress={() => void state.updateCase({ handling: "ai" })}>
              {t("support.enableAI")}
            </Button>
          )}
        </div>
      )}
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
      {state.transcript && (
        <Form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            state.setLanguage(
              String(new FormData(event.currentTarget).get("locale") ?? "") || null
            );
          }}
        >
          <TextField name="locale">
            <Label>{t("support.language")}</Label>
            <Input
              key={state.selectedId}
              defaultValue={
                state.transcript.case.supportLocale ??
                state.transcript.case.detectedLocale ??
                state.transcript.case.uiLocale
              }
            />
          </TextField>
          <Button type="submit" size="sm">
            {t("support.save")}
          </Button>
        </Form>
      )}
      {!admin && state.transcript?.feedback.eligible && (
        <fieldset className="rounded-lg border border-border p-3">
          <legend className="text-sm">{t("support.csat.question")}</legend>
          <div className="flex gap-3">
            {([-1, 0, 1] as const).map((score, index) => (
              <Button
                key={score}
                size="lg"
                aria-label={t(`support.csat.score.${score}`)}
                aria-pressed={state.transcript?.feedback.score === score}
                isDisabled={state.isRating}
                variant={state.transcript?.feedback.score === score ? "primary" : "secondary"}
                onPress={() => state.rate(score)}
              >
                {["🙁", "😐", "🙂"][index]}
              </Button>
            ))}
          </div>
        </fieldset>
      )}
      <Form
        key={`${state.selectedId ?? "new"}:${selectedReply?.id ?? "blank"}`}
        onSubmit={submit}
        className={
          internalNote
            ? "grid gap-3 rounded-lg border border-warning bg-warning/10 p-3"
            : "grid gap-3"
        }
      >
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
        {state.selectedId && (
          <TextField name="files">
            <Label>{t("support.attachFiles")}</Label>
            <Input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,.log"
              onChange={(event) => void state.uploadFiles(Array.from(event.target.files ?? []))}
            />
            <p className="text-xs text-muted">
              {t("support.attachedCount", { count: state.attachmentIds.length })}
            </p>
          </TextField>
        )}
        <TextField name="body" isRequired maxLength={20000}>
          <Label>{t(internalNote ? "support.internalNote" : "support.message")}</Label>
          <TextArea rows={3} defaultValue={selectedReply?.body} />
          <FieldError />
        </TextField>
        {admin && state.selectedId && (
          <Checkbox
            name="internal"
            value="true"
            isSelected={internalNote}
            onChange={setInternalNote}
          >
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              {t("support.internalNote")}
            </Checkbox.Content>
          </Checkbox>
        )}
        {admin && state.selectedId && !internalNote && (
          <Checkbox name="preview" value="true">
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              {t("support.previewBeforeSend")}
            </Checkbox.Content>
          </Checkbox>
        )}
        <Button type="submit" isDisabled={state.isPending} variant="primary">
          {t(
            state.isPending ? "support.sending" : internalNote ? "support.addNote" : "support.send"
          )}
        </Button>
      </Form>
    </section>
  );
}
