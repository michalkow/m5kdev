import { Label, ListBox, Select } from "@heroui/react";
import type { AuthLocaleDefinition } from "@m5kdev/commons/modules/auth/auth.locale";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import type { Key } from "@react-types/shared";
import { useTranslation } from "react-i18next";

export interface AuthLocaleSelectProps {
  value: string;
  onChange: (locale: string) => void;
  label?: string;
  description?: string;
}

export function AuthLocaleSelect({
  value,
  onChange,
  label,
  description,
}: AuthLocaleSelectProps) {
  const { t } = useTranslation("web-ui");
  const { locales } = useAppConfig();

  if (!locales) return null;

  const handleSelectionChange = (key: Key | null): void => {
    if (key === null) return;
    onChange(String(key));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{label ?? t("web-ui:locale.label")}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <Select
        aria-label={label ?? t("web-ui:locale.label")}
        selectedKey={value}
        onSelectionChange={handleSelectionChange}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {locales.locales.map((localeOption: AuthLocaleDefinition) => (
              <ListBox.Item
                key={localeOption.code}
                id={localeOption.code}
                textValue={localeOption.displayName}
              >
                <Label>{localeOption.displayName}</Label>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  );
}
