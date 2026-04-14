import { Button, InputGroup, Popover } from "@heroui/react";
import { hexToHsva } from "@uiw/color-convert";
import Colorful from "@uiw/react-color-colorful";
import { PipetteIcon } from "lucide-react";
import { type ComponentProps, useEffect, useState } from "react";

function safeHexToHsva(hex: string) {
  try {
    return hexToHsva(hex);
  } catch {
    return { h: 0, s: 0, v: 0, a: 1 };
  }
}

export function ColorPicker({
  disableAlpha = true,
  value,
  onValueChange,
  className,
  ...props
}: Omit<ComponentProps<typeof InputGroup.Input>, "onChange" | "value"> & {
  disableAlpha?: boolean;
  value?: string;
  onValueChange?: (hex: string) => void;
}) {
  const [hsva, setHsva] = useState(safeHexToHsva(value || ""));
  useEffect(() => {
    setHsva(safeHexToHsva(value || ""));
  }, [value]);
  const rootClassName = typeof className === "string" ? className : undefined;
  return (
    <InputGroup.Root className={rootClassName} variant="secondary" fullWidth>
      <InputGroup.Input
        {...props}
        value={value ?? ""}
        onChange={(e) => onValueChange?.(String(e.target.value))}
      />
      <InputGroup.Suffix className="pr-1">
        <Popover>
          <Popover.Trigger>
            <Button isIconOnly aria-label="Pick color" size="sm" variant="ghost">
              <PipetteIcon className="h-4 w-4 text-foreground" />
            </Button>
          </Popover.Trigger>
          <Popover.Content aria-label="Color picker">
            <Colorful
              color={hsva}
              disableAlpha={disableAlpha}
              onChange={(color) => {
                setHsva(color.hsva);
                onValueChange?.(color.hex);
              }}
            />
          </Popover.Content>
        </Popover>
      </InputGroup.Suffix>
    </InputGroup.Root>
  );
}
