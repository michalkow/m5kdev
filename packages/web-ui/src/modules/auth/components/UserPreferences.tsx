import { Button, Form, Input, Select, SelectItem, Switch } from "@heroui/react";
import type { FormEvent, ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { z } from "zod";

type UpdatePreferencesOptions = {
  noOptimisticUpdate?: boolean;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
};

interface ControlDefinition {
  label: string;
  element: "switch" | "select" | "number";
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  step?: number;
}

type ControlsFor<Preferences> = {
  [K in keyof Preferences]: ControlDefinition;
};

export function UserPreferences<S extends z.ZodObject<z.ZodRawShape>>({
  schema,
  controls,
  preferences,
  isLoading,
  isPending,
  updatePreferences,
}: {
  schema: S;
  controls: ControlsFor<z.infer<S>>;
  preferences: z.infer<S>;
  isLoading: boolean;
  isPending: boolean;
  updatePreferences: (
    partialPreferences: Partial<z.infer<S>>,
    options: UpdatePreferencesOptions
  ) => void;
}): ReactElement {
  const { t } = useTranslation("web-ui");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const keys = Object.keys(controls) as Array<keyof typeof controls>;
    const raw: Record<string, unknown> = {};
    for (const key of keys) {
      const control = controls[key];
      if (control.element === "switch") {
        raw[String(key)] = formData.get(String(key)) != null;
      }
      if (control.element === "select") {
        raw[String(key)] = formData.get(String(key)) as string;
      }
      if (control.element === "number") {
        const value = formData.get(String(key));
        raw[String(key)] = value == null || value === "" ? undefined : Number(value);
      }
    }

    const result = schema.safeParse(raw);
    if (result.success) {
      updatePreferences(result.data as Partial<z.infer<S>>, {
        noOptimisticUpdate: true,
        onSuccess: () => {
          toast.success("Preferences updated");
        },
        onError: () => {
          toast.error("Failed to update preferences");
        },
      });
    } else {
      // eslint-disable-next-line no-console
      console.error(result.error);
    }
  }

  const keys = Object.keys(controls) as Array<keyof typeof controls>;

  if (isLoading) {
    // FIXME: Add a loading state
    return <div>Loading...</div>;
  }

  return (
    <Form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("web-ui:preferences.title")}</h1>
      {keys.map((key) => {
        const control = controls[key];
        switch (control.element) {
          case "switch":
            return (
              <Switch
                key={String(key)}
                name={String(key)}
                value="on"
                defaultSelected={Boolean(preferences[key as keyof typeof preferences])}
              >
                {control.label}
              </Switch>
            );
          case "select":
            return (
              <Select
                key={String(key)}
                name={String(key)}
                label={control.label}
                labelPlacement="outside-top"
                defaultSelectedKeys={[String(preferences[key as keyof typeof preferences])]}
              >
                {(control.options ?? []).map((option) => (
                  <SelectItem key={option.value}>{option.label}</SelectItem>
                ))}
              </Select>
            );
          case "number":
            return (
              <Input
                key={String(key)}
                name={String(key)}
                type="number"
                label={control.label}
                labelPlacement="outside-top"
                defaultValue={String(preferences[key as keyof typeof preferences] ?? "")}
                min={control.min}
                max={control.max}
                step={control.step}
              />
            );
          default:
            return <div key={String(key)}>Invalid control</div>;
        }
      })}
      <Button type="submit" color="success" isLoading={isPending}>
        {t("web-ui:preferences.submit")}
      </Button>
    </Form>
  );
}
