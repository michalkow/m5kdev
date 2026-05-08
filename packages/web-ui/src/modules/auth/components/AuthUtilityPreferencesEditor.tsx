import { Button, Form, Label, ListBox, NumberField, Select, Switch, toast } from "@heroui/react";
import type { FormEvent, ReactElement } from "react";
import type { z } from "zod";

export type UpdatePreferencesOptions = {
  noOptimisticUpdate?: boolean;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
};

export interface ControlDefinition {
  label: string;
  element: "switch" | "select" | "number";
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  step?: number;
}

export type ControlsFor<Preferences> = {
  [K in keyof Preferences]: ControlDefinition;
};

export type PreferenceEditorLabels = {
  title: string;
  submit: string;
  updated: string;
  updateError: string;
  loading?: string;
};

export type PreferenceEditorProps<S extends z.ZodObject<z.ZodRawShape>> = {
  schema: S;
  controls: ControlsFor<z.infer<S>>;
  values: Record<string, unknown>;
  isLoading: boolean;
  isPending: boolean;
  labels: PreferenceEditorLabels;
  updateValues: (partialValues: Partial<z.infer<S>>, options: UpdatePreferencesOptions) => void;
};

export function AuthUtilityPreferencesEditor<S extends z.ZodObject<z.ZodRawShape>>({
  schema,
  controls,
  values,
  isLoading,
  isPending,
  labels,
  updateValues,
}: PreferenceEditorProps<S>): ReactElement {
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
      updateValues(result.data as Partial<z.infer<S>>, {
        noOptimisticUpdate: true,
        onSuccess: () => {
          toast.success(labels.updated);
        },
        onError: () => {
          toast.danger(labels.updateError);
        },
      });
    } else {
      // eslint-disable-next-line no-console
      console.error(result.error);
    }
  }

  const keys = Object.keys(controls) as Array<keyof typeof controls>;
  const formKey = keys
    .map((key) => `${String(key)}:${String(values[key as keyof typeof values])}`)
    .join("|");

  if (isLoading) {
    return <div>{labels.loading ?? "Loading..."}</div>;
  }

  return (
    <Form key={formKey} onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{labels.title}</h1>
      {keys.map((key) => {
        const control = controls[key];
        const value = values[key as keyof typeof values];

        switch (control.element) {
          case "switch":
            return (
              <Switch
                key={String(key)}
                name={String(key)}
                value="on"
                defaultSelected={Boolean(value)}
              >
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <Switch.Content>
                  <Label className="text-sm">{control.label}</Label>
                </Switch.Content>
              </Switch>
            );
          case "select":
            return (
              <div key={String(key)} className="grid gap-2">
                <Label className="text-sm font-medium">{control.label}</Label>
                <Select
                  name={String(key)}
                  defaultSelectedKey={
                    value == null || value === "" ? undefined : String(value as string)
                  }
                >
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {(control.options ?? []).map((option) => (
                        <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
                          {option.label}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>
            );
          case "number":
            return (
              <div key={String(key)} className="grid gap-2">
                <NumberField defaultValue={(value as number) ?? undefined}>
                  <Label className="text-sm font-medium">{control.label}</Label>
                  <NumberField.Group>
                    <NumberField.DecrementButton />
                    <NumberField.Input
                      id={`pref-${String(key)}`}
                      name={String(key)}
                      type="number"
                      min={control.min}
                      max={control.max}
                      step={control.step}
                    />
                    <NumberField.IncrementButton />
                  </NumberField.Group>
                </NumberField>
              </div>
            );
          default:
            return <div key={String(key)}>Invalid control</div>;
        }
      })}
      <Button type="submit" variant="primary" isPending={isPending}>
        {labels.submit}
      </Button>
    </Form>
  );
}
