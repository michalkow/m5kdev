import { Label, ListBox, Select } from "@heroui/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function AuthUtilityThemePicker() {
  const { t } = useTranslation("web-ui");
  const saved = localStorage.getItem("theme") as "light" | "dark" | null;
  const [theme, setTheme] = useState<"light" | "dark" | "system">(saved ?? "system");

  const handleChange = (value: "light" | "dark" | "system") => {
    setTheme(value);
    const d = document.documentElement;

    const theme =
      value === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : value;

    d.classList.remove("light", "dark");
    d.classList.add(theme);
    d.setAttribute("data-theme", theme);
    d.style.colorScheme = theme;

    if (value === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", value);
  };
  return (
    <div>
      <div className="flex flex-col gap-1 mb-4">
        <p className="text-xl font-semibold">{t("web-ui:theme.title")}</p>
        <p className="text-sm text-muted">{t("web-ui:theme.description")}</p>
      </div>
      <Select
        value={theme}
        onChange={(value) => handleChange(value as unknown as "light" | "dark" | "system")}
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
