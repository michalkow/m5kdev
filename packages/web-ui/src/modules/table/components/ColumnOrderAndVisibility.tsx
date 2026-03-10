import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EyeIcon, EyeOffIcon, GripVertical } from "lucide-react";
import { useCallback, useState } from "react";
import type { ColumnOrderState, VisibilityState } from "@tanstack/react-table";
import { Button } from "#components/ui/button";
import type { ColumnItem } from "./table.types";

interface ColumnOrderAndVisibilityItemProps {
  column: ColumnItem;
  onChangeVisibilityState: (columnId: string) => void;
}

const ColumnOrderAndVisibilityItem = ({
  column,
  onChangeVisibilityState,
}: ColumnOrderAndVisibilityItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: column.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex justify-between items-center gap-2"
    >
      {column.label}
      <div className="flex items-center gap-2">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-4 w-4" />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onChangeVisibilityState(String(column.id))}
        >
          {column.visibility ? <EyeIcon className="h-4 w-4" /> : <EyeOffIcon className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};

interface ColumnOrderAndVisibilityProps {
  layout: ColumnItem[];
  onChangeOrder: (order: ColumnOrderState) => void;
  onChangeVisibility: (visibility: VisibilityState) => void;
  onClose: () => void;
}

export const ColumnOrderAndVisibility = ({
  layout,
  onChangeOrder,
  onChangeVisibility,
  onClose,
}: ColumnOrderAndVisibilityProps) => {
  const [activeLayout, setActiveLayout] = useState<ColumnItem[]>([...layout]);

  const onChangeVisibilityState = useCallback((columnId: string) => {
    setActiveLayout((prev) => {
      const index = prev.findIndex((c) => c.id === columnId);
      if (index !== -1) {
        const newLayout = [...prev];
        newLayout[index] = { ...prev[index], visibility: !prev[index].visibility };
        return newLayout;
      }
      return prev;
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const onSubmit = useCallback(() => {
    onChangeOrder(activeLayout.map((column) => column.id));
    onChangeVisibility(
      Object.fromEntries(activeLayout.map((column) => [column.id, column.visibility]))
    );
    onClose();
  }, [activeLayout, onChangeOrder, onChangeVisibility, onClose]);

  return (
    <div className="flex flex-col gap-2 p-1 min-w-[200px]">
      <DndContext
        onDragEnd={({ active, over }) => {
          if (over && active.id !== over?.id) {
            const activeIndex = activeLayout.findIndex(({ id }) => id === active.id);
            const overIndex = activeLayout.findIndex(({ id }) => id === over.id);

            setActiveLayout(arrayMove(activeLayout, activeIndex, overIndex));
          }
        }}
        sensors={sensors}
      >
        <SortableContext
          items={activeLayout.map((column) => column.id)}
          strategy={verticalListSortingStrategy}
        >
          {activeLayout.map((column) => (
            <ColumnOrderAndVisibilityItem
              key={column.id}
              column={column}
              onChangeVisibilityState={onChangeVisibilityState}
            />
          ))}
        </SortableContext>
      </DndContext>
      <Button onClick={onSubmit}>Apply</Button>
    </div>
  );
};

