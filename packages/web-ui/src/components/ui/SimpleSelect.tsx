import { Label, ListBox, Select, type SelectProps } from "@heroui/react";

export function SimpleSelect<T extends object, M extends "single" | "multiple">({
  data,
  label,
  ...props
}: SelectProps<T, M> & { data: { label: string; value: string }[]; label: string }) {
  return (
    <Select {...props}>
      {label && <Label>{label}</Label>}
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {data.map((item) => (
            <ListBox.Item key={item.value} id={item.value} textValue={item.label}>
              {item.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
