import { ChevronDown, RotateCcw } from "lucide-react";
import * as React from "react";

import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "../lib/utils";

interface MultiSelectOption {
  label: string;
  icon?: React.ReactNode;
  value: string;
  group?: string;
}

interface MultiSelectDropdownProps {
  options: MultiSelectOption[];
  selectedValues: string[];
  onValueChange: (selectedValues: string[]) => void;
  placeholder?: React.ReactNode;
  label?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  maxDisplayCount?: number;
  multiSelectLabel?: string;
  trigger?: React.ReactNode;
  resetButton?: "bottom" | "top";
  resetLabel?: React.ReactNode;
  separateGroups?: boolean;
}

const MultiSelectDropdown = React.forwardRef<
  React.ElementRef<typeof DropdownMenuTrigger>,
  MultiSelectDropdownProps
>(
  (
    {
      options,
      selectedValues,
      onValueChange,
      placeholder = "Select items...",
      label,
      className,
      triggerClassName,
      trigger,
      multiSelectLabel,
      disabled = false,
      maxDisplayCount = 3,
      resetButton = "bottom",
      resetLabel = "Reset",
      separateGroups = false,
      ...props
    },
    ref
  ) => {
    const handleValueChange = (value: string, checked: boolean) => {
      if (checked) {
        onValueChange([...selectedValues, value]);
      } else {
        onValueChange(selectedValues.filter((v) => v !== value));
      }
    };

    const handleReset = () => {
      onValueChange([]);
    };

    const getDisplayText = () => {
      if (selectedValues.length === 0) {
        return placeholder;
      }

      const selectedLabels = options
        .filter((option) => selectedValues.includes(option.value))
        .map((option) => option.label);

      if (multiSelectLabel && selectedLabels.length > 1) {
        return multiSelectLabel;
      }

      if (selectedLabels.length <= maxDisplayCount) {
        return selectedLabels.join(", ");
      }

      return `${selectedLabels.slice(0, maxDisplayCount).join(", ")} (+${
        selectedLabels.length - maxDisplayCount
      } more)`;
    };

    const groupedOptions = React.useMemo(() => {
      const groups: Record<string, MultiSelectOption[]> = {};
      const ungrouped: MultiSelectOption[] = [];

      options.forEach((option) => {
        if (option.group) {
          if (!groups[option.group]) {
            groups[option.group] = [];
          }
          groups[option.group].push(option);
        } else {
          ungrouped.push(option);
        }
      });

      return { groups, ungrouped };
    }, [options]);

    return (
      <div className={cn("w-full", className)}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={ref}
              variant="outline"
              className={cn(
                "w-full justify-between text-left font-normal",
                selectedValues.length === 0 && "text-muted-foreground",
                triggerClassName
              )}
              disabled={disabled}
              {...props}
            >
              {trigger || (
                <>
                  <span className="truncate">{getDisplayText()}</span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-full min-w-[var(--radix-dropdown-menu-trigger-width)]"
            align="start"
          >
            {resetButton && resetButton === "top" && (
              <>
                <DropdownMenuItem
                  onClick={handleReset}
                  disabled={selectedValues.length === 0}
                  onSelect={(event) => event.preventDefault()}
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  {resetLabel || (
                    <>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reset
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {label && (
              <>
                <DropdownMenuLabel>{label}</DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            )}
            {Object.entries(groupedOptions.groups).map(([groupName, groupOptions], groupIndex) => (
              <DropdownMenuGroup key={groupName}>
                {groupIndex > 0 && separateGroups && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground px-2 py-1.5">
                  {groupName}
                </DropdownMenuLabel>
                {groupOptions.map((option) => (
                  <DropdownMenuCheckboxItem
                    key={option.value}
                    checked={selectedValues.includes(option.value)}
                    onCheckedChange={(checked) => handleValueChange(option.value, checked)}
                    onSelect={(event) => event.preventDefault()}
                    className="cursor-pointer"
                  >
                    {option.icon && <span className="mr-2">{option.icon}</span>}
                    {option.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            ))}
            {groupedOptions.ungrouped.length > 0 && (
              <DropdownMenuGroup>
                {Object.keys(groupedOptions.groups).length > 0 && <DropdownMenuSeparator />}
                {groupedOptions.ungrouped.map((option) => (
                  <DropdownMenuCheckboxItem
                    key={option.value}
                    checked={selectedValues.includes(option.value)}
                    onCheckedChange={(checked) => handleValueChange(option.value, checked)}
                    onSelect={(event) => event.preventDefault()}
                    className="cursor-pointer"
                  >
                    {option.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            )}
            {resetButton && resetButton === "bottom" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleReset}
                  disabled={selectedValues.length === 0}
                  onSelect={(event) => event.preventDefault()}
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  {resetLabel || (
                    <>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reset
                    </>
                  )}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }
);

MultiSelectDropdown.displayName = "MultiSelectDropdown";

export { MultiSelectDropdown };
export type { MultiSelectOption, MultiSelectDropdownProps };
