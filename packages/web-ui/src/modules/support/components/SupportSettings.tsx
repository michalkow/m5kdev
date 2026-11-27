import { Button, Form, Input, Label, TextField } from "@heroui/react";
import type { useSupport } from "@m5kdev/frontend/modules/support/hooks/useSupport";
import { useTranslation } from "react-i18next";
import { SupportCalendarSettings } from "./SupportCalendarSettings";

type State = ReturnType<typeof useSupport>;
const limits = [
  "monthlyCalls",
  "dailyUserCalls",
  "maxInputCharacters",
  "maxOutputCharacters",
  "concurrency",
  "attempts",
  "timeoutMs",
] as const;
export function SupportSettings({ state }: { state: State }) {
  const { t } = useTranslation("web-ui");
  const settings = state.settings;
  if (!settings) return null;
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const feature = (kind: "translation" | "ai") => {
      const enabled = data.get(`${kind}.enabled`) === "true";
      const values = Object.fromEntries(
        limits.map((key) => [key, Number(data.get(`${kind}.${key}`))])
      ) as Record<(typeof limits)[number], number>;
      return { enabled, ...(enabled ? { budget: values } : {}) };
    };
    try {
      await state.saveSettings({
        expectedVersion: settings.version,
        nativeLocales: String(data.get("nativeLocales") ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        fallbackLocale: String(data.get("fallbackLocale") ?? ""),
        translation: feature("translation"),
        ai: feature("ai"),
        csatEnabled: data.get("csatEnabled") === "true",
        calendar: settings.calendar,
        replyExpectation: String(data.get("replyExpectation") ?? ""),
      });
    } catch {
      /* The query hook exposes the mutation error. */
    }
  };
  return (
    <details className="rounded-lg border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        {t("support.settings.title")}
      </summary>
      <p className="my-2 text-xs text-muted">
        {t("support.settings.appLocales", { locales: settings.locales.join(", ") })}
      </p>
      <Form key={settings.version} onSubmit={submit} className="grid gap-3">
        <TextField name="nativeLocales" isRequired>
          <Label>{t("support.settings.native")}</Label>
          <Input defaultValue={settings.nativeLocales.join(", ")} />
        </TextField>
        <TextField name="fallbackLocale" isRequired>
          <Label>{t("support.settings.fallback")}</Label>
          <Input defaultValue={settings.fallbackLocale} />
        </TextField>
        <TextField name="replyExpectation">
          <Label>{t("support.settings.expectation")}</Label>
          <Input defaultValue={settings.replyExpectation} maxLength={500} />
        </TextField>
        <label className="flex gap-2">
          <input
            type="checkbox"
            name="csatEnabled"
            value="true"
            defaultChecked={settings.csatEnabled}
          />
          {t("support.csat.enable")}
        </label>
        {(["translation", "ai"] as const).map((kind) => (
          <fieldset key={kind} className="grid gap-2 rounded-lg border border-border p-3">
            <legend>{t(`support.settings.${kind}`)}</legend>
            <label className="flex gap-2">
              <input
                name={`${kind}.enabled`}
                type="checkbox"
                value="true"
                defaultChecked={settings[kind].enabled}
              />
              {t("support.settings.enable")}
            </label>
            {limits.map((key) => (
              <TextField key={key} name={`${kind}.${key}`}>
                <Label>{t(`support.settings.${key}`)}</Label>
                <Input type="number" min={1} defaultValue={settings[kind].budget?.[key]} />
              </TextField>
            ))}
          </fieldset>
        ))}
        <Button type="submit" size="sm">
          {t("support.save")}
        </Button>
      </Form>
      <Form
        className="mt-3 flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          state.setWorkingLocale({
            locale: String(new FormData(event.currentTarget).get("locale") ?? ""),
          });
        }}
      >
        <TextField name="locale" isRequired>
          <Label>{t("support.settings.working")}</Label>
          <Input defaultValue={settings.workingLocale} />
        </TextField>
        <Button type="submit" size="sm">
          {t("support.save")}
        </Button>
      </Form>
      <SupportCalendarSettings key={settings.version} state={state} />
      <section className="mt-3 grid gap-2" aria-label={t("support.documentation.title")}>
        <TextField name="manifest">
          <Label>{t("support.documentation.upload")}</Label>
          <Input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void state.stageDocumentation(file);
            }}
          />
        </TextField>
        {state.documentation?.map((corpus) => (
          <div key={corpus.id} className="flex items-center justify-between gap-2 text-xs">
            <span>
              {corpus.version.slice(0, 12)} · {t(`support.documentation.state.${corpus.state}`)}{" "}
              {corpus.error && t("support.documentation.failed")}
            </span>
            <Button
              size="sm"
              variant="tertiary"
              onPress={() => state.withdrawDocumentation({ version: corpus.version })}
            >
              {t("support.documentation.withdraw")}
            </Button>
          </div>
        ))}
      </section>
    </details>
  );
}
