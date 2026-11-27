import { Button, Form, Input, Label, TextField } from "@heroui/react";
import type { useSupport } from "@m5kdev/frontend/modules/support/hooks/useSupport";
import { useTranslation } from "react-i18next";
export function SupportOverview({ state }: { state: ReturnType<typeof useSupport> }) {
  const { t, i18n } = useTranslation("web-ui");
  const overview = state.overview;
  if (!overview) return null;
  const duration = (ms: number | null) =>
    ms === null
      ? t("support.overview.noSample")
      : `${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(ms / 1000)} ${t("support.overview.seconds")}`;
  return (
    <section
      aria-label={t("support.overview.title")}
      className="grid gap-3 rounded-lg border border-border p-3"
    >
      <h3 className="font-semibold">{t("support.overview.title")}</h3>
      <Form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void state.setFilters({
            supportSince: String(new FormData(event.currentTarget).get("since") ?? ""),
          });
        }}
      >
        <TextField name="since">
          <Label>{t("support.overview.since")}</Label>
          <Input type="date" defaultValue={state.filters.supportSince} />
        </TextField>
        <Button size="sm" type="submit">
          {t("support.filter.apply")}
        </Button>
      </Form>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {(["open", "unassigned"] as const).map((key) => (
          <p key={key}>
            {t(`support.overview.${key}`)}: {overview[key]}
          </p>
        ))}
        {(["support", "user", "external"] as const).map((key) => (
          <p key={key}>
            {t(`support.wait.${key}`)}: {overview.waiting[key]}
          </p>
        ))}
      </div>
      <p className="text-xs text-muted">
        {t("support.overview.cohort", {
          date: new Intl.DateTimeFormat(i18n.language).format(overview.from),
          count: overview.sampleCases,
        })}
      </p>
      {overview.partial && <p role="status">{t("support.overview.partial")}</p>}
      <p>
        {t("support.overview.firstHuman")}: {t("support.overview.median")}{" "}
        {duration(overview.firstHumanResponse.medianMs)} · p95{" "}
        {duration(overview.firstHumanResponse.p95Ms)} ·{" "}
        {t("support.overview.samples", { count: overview.firstHumanResponse.samples })} ·{" "}
        {t("support.overview.unanswered", { count: overview.firstHumanResponse.unanswered })}
      </p>
      <p>
        {t("support.overview.handoff")}: {t("support.overview.median")}{" "}
        {duration(overview.handoffWait.medianMs)} · p95 {duration(overview.handoffWait.p95Ms)}
      </p>
      {(["human", "ai"] as const).map((kind) => (
        <p key={kind}>
          {t(`support.overview.csat.${kind}`)}:{" "}
          {overview.csat[kind].positive === null
            ? t("support.overview.noSample")
            : new Intl.NumberFormat(i18n.language, {
                style: "percent",
                maximumFractionDigits: 1,
              }).format(overview.csat[kind].positive)}{" "}
          · {t("support.overview.samples", { count: overview.csat[kind].samples })}
        </p>
      ))}
      <h4 className="text-sm font-medium">{t("support.overview.oldest")}</h4>
      <div className="grid gap-1">
        {overview.oldestUnanswered.map((item) => (
          <Button
            key={item.id}
            size="sm"
            variant="tertiary"
            className="justify-start"
            onPress={() => state.selectCase(item.id)}
          >
            {item.subject} ·{" "}
            {new Intl.DateTimeFormat(i18n.language, {
              dateStyle: "short",
              timeStyle: "short",
            }).format(item.since)}
          </Button>
        ))}
      </div>
    </section>
  );
}
