import { useState } from "react";
import { Button } from "../../../components/ui/button";
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
      <div className="flex flex-col gap-0.5">
        {columns.map((col) => (
          <button
            key={col.id}
            type="button"
            className={cn(
              "text-left px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors flex items-center gap-2",
              selected.includes(col.id) && "bg-muted font-medium"
            )}
            onClick={() => toggle(col.id)}
          >
            <span
              className={cn(
                "h-4 w-4 rounded border border-muted-foreground/40 flex items-center justify-center shrink-0 text-xs",
                selected.includes(col.id) && "bg-primary border-primary text-primary-foreground"
              )}
            >
              {selected.includes(col.id) ? "✓" : ""}
            </span>
            {col.label}
            {selected.includes(col.id) && selected.length > 1 && (
              <span className="text-muted-foreground text-xs ml-auto">
                {selected.indexOf(col.id) + 1}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" onClick={onClear} className="flex-1">
          Clear
        </Button>
        <Button size="sm" onClick={onApply} className="flex-1">
          Apply
        </Button>
      </div>
    </div>
  );
};
