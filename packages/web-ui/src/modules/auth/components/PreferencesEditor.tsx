import { Button, Form, Input, Select, SelectItem, Switch } from "@heroui/react";
import type { FormEvent, ReactElement } from "react";
import { toast } from "sonner";
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
  values: Partial<z.infer<S>>;
  isLoading: boolean;
  isPending: boolean;
  labels: PreferenceEditorLabels;
  updateValues: (partialValues: Partial<z.infer<S>>, options: UpdatePreferencesOptions) => void;
};

export function PreferencesEditor<S extends z.ZodObject<z.ZodRawShape>>({
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
          toast.error(labels.updateError);
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
    <Form key={formKey} onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
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
                defaultSelectedKeys={value == null || value === "" ? [] : [String(value)]}
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
                defaultValue={value == null ? "" : String(value)}
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
        {labels.submit}
      </Button>
    </Form>
  );
}
