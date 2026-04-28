import { Button, Label, Radio, RadioGroup } from "@heroui/react";
import { useState } from "react";

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
  const [selected, setSelected] = useState<string>(activeGrouping[0] ?? "");

  const onApply = () => {
    onGroupingChange(selected ? [selected] : []);
    onClose();
  };

  const onClear = () => {
    setSelected("");
  };

  return (
    <div className="flex flex-col gap-2  min-w-[180px]">
      <RadioGroup value={selected} onChange={setSelected} variant="secondary">
        {columns.map((col) => (
          <Radio key={col.id} value={col.id}>
            <Radio.Control>
              <Radio.Indicator />
            </Radio.Control>
            <Radio.Content>
              <Label>{col.label}</Label>
            </Radio.Content>
          </Radio>
        ))}
      </RadioGroup>
      <div className="flex gap-2">
        <Button size="sm" variant="tertiary" onPress={onClear} className="flex-1">
          Clear
        </Button>
        <Button size="sm" onPress={onApply} className="flex-1">
          Apply
        </Button>
      </div>
    </div>
  );
};
