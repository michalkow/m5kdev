import { Label, ListBox, Select, type SelectProps } from "@heroui/react";

export function SimpleSelect<T extends object, M extends "single" | "multiple">({
  data,
  ...props
}: SelectProps<T, M> & { data: { label: string; value: string }[] }) {
  return (
    <Select {...props}>
      <Label>State</Label>
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
