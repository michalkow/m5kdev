import { Label, ListBox, Select, toast } from "@heroui/react";
import type { AuthLocaleDefinition } from "@m5kdev/commons/modules/auth/auth.locale";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import type { Key } from "@react-types/shared";
import { useTranslation } from "react-i18next";

export interface AuthPublicLocaleSwitcherProps {
  value: string;
  onChange: (locale: string) => void | Promise<void>;
}

export function AuthPublicLocaleSwitcher({ value, onChange }: AuthPublicLocaleSwitcherProps) {
  const { t } = useTranslation("web-ui");
  const { locales } = useAppConfig();

  if (!locales || locales.locales.length <= 1) return null;

  const handleSelectionChange = (key: Key | null): void => {
    if (key === null || String(key) === value) return;

    void Promise.resolve(onChange(String(key)))
      .then(() => {
        toast.success(t("web-ui:locale.updated"));
      })
      .catch((error: unknown) => {
        toast.danger(t("web-ui:locale.updateError"), {
          description: error instanceof Error ? error.message : String(error),
        });
      });
  };

  return (
    <Select
      aria-label={t("web-ui:locale.label")}
      selectedKey={value}
      onSelectionChange={handleSelectionChange}
      className="min-w-36"
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
  );
}
