import { Button, Checkbox, Label } from "@heroui/react";
import { useState } from "react";
import { cn } from "../../../lib/utils";

interface TableGroupByColumn {
  id: string;
  label: string;
}

interface TableGroupByProps {
  columns: TableGroupByColumn[];
  activeGrouping: string[];
  onGroupingChange: (columnIds: string[]) => void;
  onClose: () => void;
}

export const TableGroupBy = ({
  columns,
  activeGrouping,
  onGroupingChange,
  onClose,
}: TableGroupByProps) => {
  const [selected, setSelected] = useState<string[]>(activeGrouping);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const onApply = () => {
    onGroupingChange(selected);
    onClose();
  };

  const onClear = () => {
    setSelected([]);
  };

  return (
    <div className="flex flex-col gap-2 p-1 min-w-[180px]">
      <div className="flex flex-col gap-1">
        {columns.map((col) => (
          <Checkbox
            variant="secondary"
            key={col.id}
            id={`table-group-by-${col.id}`}
            isSelected={selected.includes(col.id)}
            onChange={() => toggle(col.id)}
          >
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>
              <Label htmlFor={`table-group-by-${col.id}`} className="truncate">
                {col.label}
              </Label>
              {selected.includes(col.id) && selected.length > 1 && (
                <span className="text-muted-foreground text-xs ml-auto">
                  {selected.indexOf(col.id) + 1}
                </span>
              )}
            </Checkbox.Content>
          </Checkbox>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="tertiary" onClick={onClear} className="flex-1">
          Clear
        </Button>
        <Button size="sm" onClick={onApply} className="flex-1">
          Apply
        </Button>
      </div>
    </div>
  );
};
