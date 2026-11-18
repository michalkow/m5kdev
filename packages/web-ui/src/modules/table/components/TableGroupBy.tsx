import { Button, Radio, RadioGroup } from "@heroui/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
            <Radio.Content>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              {col.label}
            </Radio.Content>
          </Radio>
        ))}
      </RadioGroup>
      <div className="flex gap-2">
        <Button size="sm" variant="tertiary" onPress={onClear} className="flex-1">
          {t("web-ui:table.clear")}
        </Button>
        <Button size="sm" onPress={onApply} className="flex-1">
          {t("web-ui:table.apply")}
        </Button>
      </div>
    </div>
  );
};
