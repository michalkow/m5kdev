import { Button, Form, Input, Label, TextArea, TextField } from "@heroui/react";
import type { useSupport } from "@m5kdev/frontend/modules/support/hooks/useSupport";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SimpleSelect } from "../../../components/ui/SimpleSelect";

type State = ReturnType<typeof useSupport>;
export function SupportCalendarSettings({ state }: { state: State }) {
  const { t } = useTranslation("web-ui");
  const settings = state.settings;
  const [windows, setWindows] = useState(
    () =>
      settings?.calendar?.weekly.map((window) => ({ ...window, key: crypto.randomUUID() })) ?? []
  );
  if (!settings) return null;
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const enabled = data.get("calendarEnabled") === "true";
    try {
      await state.saveSettings({
        ...settings,
        expectedVersion: settings.version,
        calendar: enabled
          ? {
              timeZone: String(data.get("timeZone") ?? ""),
              weekly: windows.map((_window, index) => ({
                day: Number(data.get(`day.${index}`)),
                opens: String(data.get(`opens.${index}`) ?? ""),
                closes: String(data.get(`closes.${index}`) ?? ""),
              })),
              holidays: String(data.get("holidays") ?? "")
                .split(/\s+/)
                .filter(Boolean),
            }
          : null,
      });
    } catch {
      /* Hook displays validation or revision error. */
    }
  };
  return (
    <Form onSubmit={submit} className="mt-3 grid gap-2 rounded-lg border border-border p-3">
      <h4>{t("support.hours.settings")}</h4>
      <label className="flex gap-2">
        <input
          type="checkbox"
          name="calendarEnabled"
          value="true"
          defaultChecked={Boolean(settings.calendar)}
        />
        {t("support.hours.enable")}
      </label>
      <TextField name="timeZone">
        <Label>{t("support.hours.timeZone")}</Label>
        <Input
          defaultValue={
            settings.calendar?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
          }
        />
      </TextField>
      {windows.map((window, index) => (
        <div key={window.key} className="grid gap-2 sm:grid-cols-4">
          <SimpleSelect
            name={`day.${index}`}
            label={t("support.hours.day")}
            defaultSelectedKey={String(window.day)}
            data={Array.from({ length: 7 }, (_, day) => ({
              value: String(day),
              label: t(`support.day.${day}`),
            }))}
          />
          <TextField name={`opens.${index}`}>
            <Label>{t("support.hours.opens")}</Label>
            <Input type="time" defaultValue={window.opens} />
          </TextField>
          <TextField name={`closes.${index}`}>
            <Label>{t("support.hours.closes")}</Label>
            <Input type="time" defaultValue={window.closes} />
          </TextField>
          <Button
            size="sm"
            variant="tertiary"
            onPress={() =>
              setWindows((current) => current.filter((item) => item.key !== window.key))
            }
          >
            {t("support.hours.remove")}
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="tertiary"
        onPress={() =>
          setWindows((current) => [
            ...current,
            { day: 1, opens: "09:00", closes: "17:00", key: crypto.randomUUID() },
          ])
        }
      >
        {t("support.hours.add")}
      </Button>
      <TextField name="holidays">
        <Label>{t("support.hours.holidays")}</Label>
        <TextArea defaultValue={settings.calendar?.holidays.join("\n")} rows={2} />
      </TextField>
      <Button size="sm" type="submit">
        {t("support.save")}
      </Button>
    </Form>
  );
}
