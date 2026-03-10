import { Check, Edit } from "lucide-react";
import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { cn } from "../lib/utils";

export interface CardSelectItem {
  id: string;
  title: string;
  description?: string;
  content?: React.ReactNode;
  disabled?: boolean;
  icon?: React.ReactNode;
  onEdit?: (id: string) => void;
}

export interface CardsSelectProps {
  items: CardSelectItem[];
  selectedIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  maxSelections?: number;
  className?: string;
  cardClassName?: string;
  showCheckbox?: boolean;
  disabled?: boolean;
  reversed?: boolean;
}

const CardsSelect = React.forwardRef<HTMLDivElement, CardsSelectProps>(
  (
    {
      items,
      selectedIds,
      onSelectionChange,
      maxSelections,
      className,
      cardClassName,
      showCheckbox = true,
      disabled = false,
      reversed = false,
      ...props
    },
    ref
  ) => {
    const handleCardClick = (itemId: string) => {
      if (disabled) return;

      const item = items.find((item) => item.id === itemId);
      if (item?.disabled) return;

      const isSelected = selectedIds.includes(itemId);

      if (isSelected) {
        // Remove from selection
        onSelectionChange(selectedIds.filter((id) => id !== itemId));
      } else {
        // Add to selection
        if (maxSelections && selectedIds.length >= maxSelections) {
          // If max selections reached, replace the first selection
          onSelectionChange([...selectedIds.slice(1), itemId]);
        } else {
          onSelectionChange([...selectedIds, itemId]);
        }
      }
    };

    const getGridClasses = () => {
      return "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 justify-items-center";
    };

    return (
      <div ref={ref} className={cn(getGridClasses(), className)} {...props}>
        {items.map((item) => {
          const isSelected = reversed
            ? !selectedIds.includes(item.id)
            : selectedIds.includes(item.id);
          const isDisabled = disabled || item.disabled;

          return (
            <Card
              key={item.id}
              className={cn(
                "relative cursor-pointer transition-all duration-200 hover:shadow-md w-full",
                isSelected && "ring-2 ring-primary bg-primary/5 border-primary",
                isDisabled && "opacity-50 cursor-not-allowed",
                !isDisabled && "hover:bg-accent/50",
                cardClassName
              )}
              onClick={() => handleCardClick(item.id)}
            >
              {/* Edit button */}
              {item.onEdit && (
                <div className="absolute top-3 left-3 z-10">
                  <button
                    type="button"
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-accent",
                      "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      item.onEdit?.(item.id);
                    }}
                    aria-label="Edit"
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Selection indicator */}
              {showCheckbox && (
                <div className="absolute top-3 right-3 z-10">
                  <div
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors",
                      isSelected
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/30 bg-background"
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>
                </div>
              )}

              {/* Card icon */}
              {item.icon && (
                <div className="flex items-center justify-center pt-6 pb-4">
                  <div className="text-5xl text-primary">
                    <i className={`ti ${item.icon}`} />
                  </div>
                </div>
              )}

              <CardHeader className={cn("pb-3 text-center", item.icon && "pt-2")}>
                <CardTitle className="text-lg leading-tight">{item.title}</CardTitle>
                {item.description && (
                  <CardDescription className="text-sm">{item.description}</CardDescription>
                )}
              </CardHeader>

              {item.content && (
                <CardContent className="pt-0 text-center">{item.content}</CardContent>
              )}
            </Card>
          );
        })}
      </div>
    );
  }
);

CardsSelect.displayName = "CardsSelect";

export { CardsSelect };
