import { Button, type ButtonProps, Checkbox } from "@heroui/react";
import { cn } from "../lib/utils";

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
  const { className: buttonClassName, ...restButtonProps } = buttonProps ?? {};
  return items.map((item) => {
    const value = typeof item === "string" ? item : item.value;
    const label = typeof item === "string" ? item : item.label;
    return (
      <Button
        key={value}
        className={cn("inline-flex items-center gap-2", buttonClassName)}
        onPress={() =>
          onSelectionChange(
            selectedItems.includes(value)
              ? selectedItems.filter((i) => i !== value)
              : [...selectedItems, value]
          )
        }
        {...restButtonProps}
      >
        <Checkbox
          isSelected={selectedItems.includes(value)}
          isReadOnly
          style={{ pointerEvents: "none" }}
        />
        {label}
      </Button>
    );
  });
}
