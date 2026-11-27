import { Button, Form, Input, Label, TextField } from "@heroui/react";
import type { useSupport } from "@m5kdev/frontend/modules/support/hooks/useSupport";
import { useTranslation } from "react-i18next";

type State = ReturnType<typeof useSupport>;
export function SupportDeskTools({
  state,
  onChooseReply,
}: {
  state: State;
  onChooseReply: (reply: { id: string; body: string }) => void;
}) {
  const { t } = useTranslation("web-ui");
  const current = state.transcript?.case;
  const filter = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void state.setFilters({
      q: String(data.get("q") ?? ""),
      status: String(data.get("status") ?? ""),
      priority: String(data.get("priority") ?? ""),
      waitingOn: String(data.get("waitingOn") ?? ""),
      assignee: String(data.get("assignee") ?? ""),
    });
  };
  return (
    <div className="grid gap-3 border-b border-border pb-3">
      <Form onSubmit={filter} className="grid gap-2 sm:grid-cols-2">
        {(["q", "status", "priority", "waitingOn", "assignee"] as const).map((key) => (
          <TextField key={key} name={key}>
            <Label>{t(`support.filter.${key}`)}</Label>
            <Input defaultValue={state.filters[key]} />
          </TextField>
        ))}
        <Button type="submit" size="sm">
          {t("support.filter.apply")}
        </Button>
      </Form>
      {current && (
        <>
          <Button
            size="sm"
            onPress={() =>
              void state.updateCase({ assignedUserId: state.currentUserId, handling: "human" })
            }
          >
            {t("support.take")}
          </Button>
          <p className="text-sm">
            {t(`support.status.${current.status}`)} · {t(`support.wait.${current.waitingOn}`)} ·{" "}
            {current.assignedUserId ?? t("support.unassigned")}
          </p>
          <div className="flex flex-wrap gap-2">
            {(["low", "normal", "high", "urgent"] as const).map((priority) => (
              <Button
                key={priority}
                size="sm"
                variant={current.priority === priority ? "secondary" : "tertiary"}
                onPress={() => void state.updateCase({ priority })}
              >
                {t(`support.priority.${priority}`)}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["support", "user", "external"] as const).map((waitingOn) => (
              <Button
                key={waitingOn}
                size="sm"
                variant={current.waitingOn === waitingOn ? "secondary" : "tertiary"}
                onPress={() => void state.updateCase({ waitingOn })}
              >
                {t(`support.wait.${waitingOn}`)}
              </Button>
            ))}
          </div>
          <Form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void state.updateCase({
                assignedUserId: String(data.get("assignee") ?? "") || null,
                handling: "human",
              });
            }}
            className="flex items-end gap-2"
          >
            <TextField name="assignee">
              <Label>{t("support.assign")}</Label>
              <Input
                key={current.id + current.assignedUserId}
                defaultValue={current.assignedUserId ?? ""}
              />
            </TextField>
            <Button type="submit" size="sm">
              {t("support.save")}
            </Button>
          </Form>
          <Form
            onSubmit={(event) => {
              event.preventDefault();
              const value = String(new FormData(event.currentTarget).get("until") ?? "");
              void state.updateCase({ snoozedUntil: value ? new Date(value) : null });
            }}
            className="flex items-end gap-2"
          >
            <TextField name="until">
              <Label>{t("support.snooze")}</Label>
              <Input type="datetime-local" />
            </TextField>
            <Button type="submit" size="sm">
              {t("support.save")}
            </Button>
          </Form>
          <div className="flex flex-wrap gap-2">
            {state.catalog?.tags.map((tag) => (
              <Button
                key={tag.id}
                size="sm"
                variant="tertiary"
                onPress={() =>
                  void state.setTags(
                    current.tagIds.includes(tag.id)
                      ? current.tagIds.filter((id) => id !== tag.id)
                      : [...current.tagIds, tag.id]
                  )
                }
              >
                {tag.name}
              </Button>
            ))}
            <Button size="sm" variant="tertiary" onPress={() => void state.setTags([])}>
              {t("support.clearTags")}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {state.catalog?.replies.map((reply) => (
              <Button
                key={reply.id}
                size="sm"
                variant="tertiary"
                onPress={() => onChooseReply(reply)}
              >
                {reply.title}
              </Button>
            ))}
          </div>
        </>
      )}
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form, (event.nativeEvent as SubmitEvent).submitter);
          void state
            .saveCatalog({
              kind: data.get("kind") === "reply" ? "reply" : "tag",
              name: String(data.get("name") ?? ""),
              body: String(data.get("body") ?? "") || undefined,
              remove: false,
            })
            .then(() => form.reset())
            .catch(() => {
              /* The shared mutation error remains visible and the draft is retained. */
            });
        }}
        className="grid gap-2"
      >
        <TextField name="name" isRequired>
          <Label>{t("support.catalogName")}</Label>
          <Input maxLength={120} />
        </TextField>
        <TextField name="body">
          <Label>{t("support.savedReply")}</Label>
          <Input maxLength={20000} />
        </TextField>
        <div className="flex gap-2">
          <Button type="submit" name="kind" value="tag" size="sm">
            {t("support.addTag")}
          </Button>
          <Button type="submit" name="kind" value="reply" size="sm">
            {t("support.addReply")}
          </Button>
        </div>
      </Form>
    </div>
  );
}
