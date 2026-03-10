import {
  Button,
  Input,
  type InputProps,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@heroui/react";
import { hexToHsva } from "@uiw/color-convert";
import Colorful from "@uiw/react-color-colorful";
import { PipetteIcon } from "lucide-react";
import { useState } from "react";

function safeHexToHsva(hex: string) {
  try {
    return hexToHsva(hex);
  } catch (err) {
    return { h: 0, s: 0, v: 0, a: 1 };
  }
}

export function ColorPicker({
  disableAlpha = true,
  value,

  onValueChange,
  ...props
}: InputProps & { disableAlpha?: boolean }) {
  const [hsva, setHsva] = useState(safeHexToHsva(value || ""));
  return (
    <Input
      onValueChange={onValueChange}
      value={value}
      endContent={
        <Popover placement="bottom">
          <PopoverTrigger>
            <Button isIconOnly aria-label="Pick color" size="sm" variant="light">
              <PipetteIcon className="h-4 w-4 text-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent aria-label="Color picker">
            <Colorful
              color={hsva}
              disableAlpha={disableAlpha}
              onChange={(color) => {
                setHsva(color.hsva);
                onValueChange?.(color.hex);
              }}
            />
          </PopoverContent>
        </Popover>
      }
      {...props}
    />
  );
}
