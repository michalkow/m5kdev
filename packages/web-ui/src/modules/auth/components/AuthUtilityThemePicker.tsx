import { Label, ListBox, Select } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../../hooks/useTheme";

export function AuthUtilityThemePicker() {
  const { t } = useTranslation("web-ui");
  const { theme, setTheme } = useTheme();

  return (
    <div>
      <div className="flex flex-col gap-1 mb-4">
        <p className="text-xl font-semibold">{t("web-ui:theme.title")}</p>
        <p className="text-sm text-muted">{t("web-ui:theme.description")}</p>
      </div>
      <Select
        value={theme}
        onChange={(value) => setTheme(value as unknown as "light" | "dark" | "system")}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="system" textValue={t("web-ui:theme.system")}>
              <Label>{t("web-ui:theme.system")}</Label>
              <ListBox.ItemIndicator />
            </ListBox.Item>
            <ListBox.Item id="light" textValue={t("web-ui:theme.light")}>
              <Label>{t("web-ui:theme.light")}</Label>
              <ListBox.ItemIndicator />
            </ListBox.Item>
            <ListBox.Item id="dark" textValue={t("web-ui:theme.dark")}>
              <Label>{t("web-ui:theme.dark")}</Label>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  );
}
