import { Label, ListBox, Select, toast } from "@heroui/react";
import type { AuthLocaleDefinition } from "@m5kdev/commons/modules/auth/auth.locale";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { useAuthLocale } from "@m5kdev/frontend/modules/auth/hooks/useAuthLocale";
import type { Key } from "@react-types/shared";
import { useTranslation } from "react-i18next";

export interface AuthUtilityLocalePickerProps {
  onLocaleChange?: (locale: string) => void | Promise<void>;
}

export function AuthUtilityLocalePicker({ onLocaleChange }: AuthUtilityLocalePickerProps) {
  const { t } = useTranslation("web-ui");
  const { locales } = useAppConfig();
  const { locale, isLoading, setLocale, isSettingLocale } = useAuthLocale();

  if (!locales) return null;

  const selectedLocale = locale ?? locales.defaultLocale;

  const handleSelectionChange = (key: Key | null): void => {
    if (key === null || String(key) === selectedLocale) return;
    setLocale(
      { locale: String(key) },
      {
        onSuccess: async (nextLocale) => {
          await onLocaleChange?.(nextLocale);
          toast.success(t("web-ui:locale.updated"));
        },
        onError: (error: unknown) => {
          toast.danger(t("web-ui:locale.updateError"), {
            description: error instanceof Error ? error.message : String(error),
          });
        },
      }
    );
  };

  return (
    <div>
      <div className="flex flex-col gap-1 mb-4">
        <p className="text-xl font-semibold">{t("web-ui:locale.title")}</p>
        <p className="text-sm text-muted">{t("web-ui:locale.description")}</p>
      </div>
      <Select
        aria-label={t("web-ui:locale.label")}
        selectedKey={selectedLocale}
        onSelectionChange={handleSelectionChange}
        isDisabled={isLoading || isSettingLocale}
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
