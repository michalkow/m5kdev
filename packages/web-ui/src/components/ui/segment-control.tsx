import { IconChevronDown } from "@tabler/icons-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

interface SegmentControlProps {
  options: string[];
  value: string | null;
  onChange: (value: string | null) => void;
  className?: string;
  resetButton: boolean;
}

const SegmentDropdown = ({ options, value, resetButton, onChange }: SegmentControlProps) => {
  const [triggerWidth, setTriggerWidth] = useState<number>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    if (triggerRef.current) {
      console.log(triggerRef.current.offsetWidth);
      setTriggerWidth(triggerRef.current.offsetWidth);
    }
  }, []);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild ref={triggerRef}>
        <Button className="w-full justify-between rounded-full border border-muted bg-muted/70 px-4 py-2 text-sm font-medium text-white">
          {value ?? resetButton ?? options[0]}
          <IconChevronDown className="ml-2 h-4 w-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        style={{ width: triggerWidth }}
        onInteractOutside={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
      >
        {resetButton && (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onChange(null);
              setOpen(false);
            }}
            className={value === null ? "bg-primary text-primary-foreground" : ""}
          >
            {resetButton}
          </DropdownMenuItem>
        )}
        {options.map((option) => (
          <DropdownMenuItem
            key={option}
            onSelect={(e) => {
              e.preventDefault();
              onChange(option);
              setOpen(false);
            }}
            className={value === option ? "bg-primary text-primary-foreground" : ""}
          >
            {option}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const SegmentControl: React.FC<SegmentControlProps> = ({
  options,
  value,
  onChange,
  className = "",
  resetButton = false,
}) => {
  // Dropdown for mobile (below sm)
  return (
    <>
      {/* Mobile: Dropdown */}
      <div className={"block sm:hidden w-full " + className}>
        <SegmentDropdown
          options={options}
          value={value}
          resetButton={resetButton}
          onChange={onChange}
        />
      </div>
      {/* Desktop: Segmented buttons */}
      <fieldset
        className={
          "hidden sm:inline-flex flex-wrap items-center justify-center gap-1 sm:gap-2 bg-muted/70 rounded-full px-2 py-1.5 sm:px-4 sm:py-2 border-0 " +
          className
        }
      >
        {options.map((option) => {
          const selected = value === option;
          return (
            <Button
              key={option}
              type="button"
              variant="ghost"
              onClick={() => onChange(option)}
              className={
                "transition px-2 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium min-w-[60px] sm:min-w-[80px] " +
                (selected
                  ? "bg-primary text-primary-foreground shadow hover:bg-primary hover:text-primary-foreground"
                  : "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground hover:shadow")
              }
              aria-pressed={selected}
            >
              {option}
            </Button>
          );
        })}
        {resetButton && (
          <>
            <div className="border-l border-muted-foreground/20 h-4 sm:h-6 mx-1 sm:mx-2" />
            <Button
              type="button"
              variant="ghost"
              onClick={() => onChange(null)}
              className={
                "transition px-2 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium min-w-[60px] sm:min-w-[80px] " +
                (value === null
                  ? "bg-primary text-primary-foreground shadow hover:bg-primary hover:text-primary-foreground"
                  : "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground hover:shadow")
              }
              aria-label="Reset"
            >
              {resetButton}
            </Button>
          </>
        )}
      </fieldset>
    </>
  );
};
