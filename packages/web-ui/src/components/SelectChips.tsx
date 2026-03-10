import { Button, type ButtonProps, Checkbox } from "@heroui/react";

export function SelectChips({
  items,
  selectedItems,
  onSelectionChange,
  buttonProps,
}: {
  items: string[] | { label: string; value: string }[];
  selectedItems: string[];
  onSelectionChange: (items: string[]) => void;
  buttonProps?: ButtonProps;
}) {
  return items.map((item) => {
    const value = typeof item === "string" ? item : item.value;
    const label = typeof item === "string" ? item : item.label;
    return (
      <Button
        key={value}
        startContent={
          <Checkbox
            isSelected={selectedItems.includes(value)}
            isReadOnly
            style={{ pointerEvents: "none" }}
          />
        }
        onPress={() =>
          onSelectionChange(
            selectedItems.includes(value)
              ? selectedItems.filter((i) => i !== value)
              : [...selectedItems, value]
          )
        }
        {...buttonProps}
      >
        {label}
      </Button>
    );
  });
}
