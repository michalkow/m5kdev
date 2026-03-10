import {
  DatePicker,
  DateRangePicker,
  type DateValue,
  Input,
  Select,
  SelectItem,
  type SharedSelection,
} from "@heroui/react";
import { getLocalTimeZone, today } from "@internationalized/date";
import type { QueryFilters } from "@m5kdev/commons/modules/schemas/query.schema";
import type {
  ColumnDataType,
  ComponentForFilterMethod,
  FilterMethod,
  FilterMethods,
} from "@m5kdev/commons/modules/table/filter.types";
import { PlusIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/button";
import {
  type FilterValue,
  type HeroUIFilter,
  transformFiltersFromHeroUI,
  transformFiltersToHeroUI,
} from "../filterTransformers";

type ComponentRenderer = (
  value: FilterValue,
  onChange: (value: FilterValue) => void,
  options?: { label: string; value: string }[]
) => ReactNode;

const componentForFilterMethod: Record<ComponentForFilterMethod, ComponentRenderer> = {
  text: (value, onChange) => (
    <Input
      size="sm"
      aria-label="Select Value"
      className="flex-1 min-w-0 text-sm"
      value={(value as string) ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
  number: (value, onChange) => (
    <Input
      size="sm"
      aria-label="Select Value"
      type="number"
      className="flex-1 min-w-0 text-sm"
      value={(value as number | null)?.toString() ?? ""}
      onChange={(e) => onChange(Number.parseFloat(e.target.value) || 0)}
    />
  ),
  date: (value, onChange) => (
    <DatePicker
      size="sm"
      aria-label="Select Value"
      className="flex-1 min-w-0 text-sm"
      value={(value as any) ?? undefined}
      onChange={(date) => date && onChange(date as FilterValue)}
      maxValue={today(getLocalTimeZone()) as unknown as DateValue}
    />
  ),
  range: (value, onChange) => (
    <DateRangePicker
      size="sm"
      aria-label="Select Value"
      className="flex-1 min-w-0 text-sm"
      value={(value as any) ?? undefined}
      onChange={(range) => range && onChange(range as FilterValue)}
      maxValue={today(getLocalTimeZone()) as unknown as DateValue}
    />
  ),
  radio: (value, onChange) => (
    <Select
      size="sm"
      aria-label="Select Value"
      className="flex-1 min-w-0 text-sm"
      selectedKeys={(value as boolean | null) ? ["true"] : ["false"]}
      onSelectionChange={(keys) => onChange(keys.currentKey === "true")}
    >
      <SelectItem key="true" className="text-sm">
        True
      </SelectItem>
      <SelectItem key="false" className="text-sm">
        False
      </SelectItem>
    </Select>
  ),
  select: (value, onChange, options = []) => (
    <Select
      size="sm"
      aria-label="Select Value"
      className="flex-1 min-w-0 text-sm"
      selectedKeys={(value as SharedSelection) ?? new Set()}
      onSelectionChange={(keys) => keys && onChange(keys as FilterValue)}
    >
      {options.map((option) => (
        <SelectItem key={option.value} className="text-sm">
          {option.label}
        </SelectItem>
      ))}
    </Select>
  ),
  multiSelect: (value, onChange, options = []) => (
    <Select
      size="sm"
      aria-label="Select Value"
      selectionMode="multiple"
      className="flex-1 min-w-0 text-sm"
      selectedKeys={value ? new Set(value as SharedSelection) : new Set()}
      onSelectionChange={(keys) => onChange(keys as FilterValue)}
    >
      {options.map((option) => (
        <SelectItem key={option.value} className="text-sm">
          {option.label}
        </SelectItem>
      ))}
    </Select>
  ),
};

const defaultFilterMethods: FilterMethods = {
  string: [
    { value: "contains", label: "Contains", component: "text" },
    { value: "equals", label: "Equals", component: "text" },
    { value: "starts_with", label: "Starts With", component: "text" },
    { value: "ends_with", label: "Ends With", component: "text" },
  ],
  number: [
    { value: "equals", label: "Equals", component: "number" },
    { value: "greater_than", label: "Greater Than", component: "number" },
    { value: "less_than", label: "Less Than", component: "number" },
  ],
  date: [
    { value: "on", label: "On", component: "date" },
    { value: "between", label: "Between", component: "range" },
    { value: "before", label: "Before", component: "date" },
    { value: "after", label: "After", component: "date" },
    { value: "intersect", label: "During", component: "range" },
  ],
  boolean: [{ value: "equals", label: "Equals", component: "radio" }],
  enum: [
    { value: "oneOf", label: "One Of", component: "multiSelect" },
    { value: "equals", label: "Equals", component: "select" },
  ],
};

const SINGLE_FILTER_KEY = "single-filter";

type TableFilteringProps = {
  columns: {
    id: string;
    label: string;
    type?: ColumnDataType | null;
    options?: { label: string; value: string }[] | null;
    endColumnId?: string | null;
    periodStartColumnId?: string | null;
    periodEndColumnId?: string | null;
  }[];
  onFiltersChange: (filters: QueryFilters) => void;
  filters: QueryFilters;
  onClose?: () => void;
  singleFilter?: boolean;
  filterMethods?: Partial<FilterMethods>;
};

const mergeFilterMethods = (overrides?: Partial<FilterMethods>): FilterMethods => ({
  string:
    overrides?.string && overrides.string.length > 0
      ? overrides.string
      : defaultFilterMethods.string,
  number:
    overrides?.number && overrides.number.length > 0
      ? overrides.number
      : defaultFilterMethods.number,
  date: overrides?.date && overrides.date.length > 0 ? overrides.date : defaultFilterMethods.date,
  boolean:
    overrides?.boolean && overrides.boolean.length > 0
      ? overrides.boolean
      : defaultFilterMethods.boolean,
  enum: overrides?.enum && overrides.enum.length > 0 ? overrides.enum : defaultFilterMethods.enum,
});

export const TableFiltering = ({
  columns,
  onFiltersChange,
  filters: initialFilters = [],
  onClose,
  singleFilter = false,
  filterMethods,
}: TableFilteringProps) => {
  const [filters, setFilters] = useState<Record<string, HeroUIFilter>>({});
  const effectiveFilterMethods = useMemo(() => mergeFilterMethods(filterMethods), [filterMethods]);

  const createEmptyFilter = useCallback(
    (): HeroUIFilter => ({
      columnId: "",
      type: null,
      value: null,
      method: null,
      options: null,
      endColumnId: null,
      periodStartColumnId: null,
      periodEndColumnId: null,
    }),
    []
  );

  const addFilter = useCallback(() => {
    setFilters((prev) => {
      if (!singleFilter) {
        const filterId = crypto.randomUUID();
        return {
          ...prev,
          [filterId]: createEmptyFilter(),
        };
      }

      // single filter mode
      return Object.keys(prev).length > 0 ? prev : { [SINGLE_FILTER_KEY]: createEmptyFilter() };
    });
  }, [createEmptyFilter, singleFilter]);

  const removeFilter = useCallback(
    (filterId: string) => {
      setFilters((prev) => {
        if (!singleFilter) {
          const { [filterId]: _, ...rest } = prev;
          return rest;
        }

        // single filter mode resets the lone filter
        return { [SINGLE_FILTER_KEY]: createEmptyFilter() };
      });
    },
    [createEmptyFilter, singleFilter]
  );

  const columnsMap = useMemo(
    () => new Map(columns.map((column) => [column.id, column])),
    [columns]
  );

  useEffect(() => {
    // Transform initialFilters from FiltersToApply format to HeroUIFilter format
    const transformedFilters = transformFiltersToHeroUI(
      initialFilters,
      columnsMap,
      effectiveFilterMethods
    );

    if (!singleFilter) {
      setFilters(Object.fromEntries(transformedFilters.map((filter) => [filter.columnId, filter])));
      return;
    }

    const firstFilter = transformedFilters[0];
    setFilters({
      [SINGLE_FILTER_KEY]: firstFilter ?? createEmptyFilter(),
    });
  }, [createEmptyFilter, initialFilters, singleFilter, columnsMap, effectiveFilterMethods]);

  const selectColumn = useCallback(
    (filterId: string, columnId: string) => {
      setFilters((prev) => {
        const oldFilter = prev[filterId];
        if (!oldFilter) return prev;
        const column = columnsMap.get(columnId);
        if (!column) return prev;

        // If Period column, auto-set intersect method
        const isPeriodColumn = columnId.endsWith("__period");
        const intersectMethod = isPeriodColumn
          ? (effectiveFilterMethods.date.find((m) => m.value === "intersect") ?? null)
          : null;

        return {
          ...prev,
          [filterId]: {
            ...oldFilter,
            columnId,
            type: column.type ?? null,
            options: column.options ?? null,
            endColumnId: column.endColumnId ?? null,
            periodStartColumnId: column.periodStartColumnId ?? null,
            periodEndColumnId: column.periodEndColumnId ?? null,
            method: intersectMethod,
            value: null,
          },
        };
      });
    },
    [columnsMap, effectiveFilterMethods]
  );

  const selectMethod = useCallback((filterId: string, method: FilterMethod) => {
    setFilters((prev) => {
      const oldFilter = prev[filterId];
      if (!oldFilter) return prev;
      return {
        ...prev,
        [filterId]: { ...oldFilter, method, value: null },
      };
    });
  }, []);

  const selectValue = useCallback((filterId: string, value: FilterValue) => {
    setFilters((prev) => {
      const oldFilter = prev[filterId];
      if (!oldFilter) return prev;
      return {
        ...prev,
        [filterId]: { ...oldFilter, value },
      };
    });
  }, []);

  const filterEntries = useMemo(() => Object.entries(filters), [filters]);

  const availableColumnsMap = useMemo(() => {
    const map = new Map<string, typeof columns>();
    filterEntries.forEach(([filterId]) => {
      const columnsUsedByOtherFilters = new Set(
        filterEntries
          .filter(([id]) => id !== filterId)
          .map(([_, f]) => f.columnId)
          .filter((id) => id !== "")
      );
      map.set(
        filterId,
        columns.filter((column) => !columnsUsedByOtherFilters.has(column.id))
      );
    });
    return map;
  }, [filterEntries, columns]);

  const applyFilters = useCallback(() => {
    const heroUIFilters = Object.values(filters);
    const filtersToApply = transformFiltersFromHeroUI(heroUIFilters);
    onFiltersChange(filtersToApply);
    onClose?.();
  }, [filters, onFiltersChange, onClose]);

  return (
    <div className="flex flex-col gap-2 p-1 min-w-[600px]">
      {filterEntries.map(([filterId, filter]) => {
        const availableColumns = availableColumnsMap.get(filterId) ?? columns;
        return (
          <TableFilteringItem
            key={filterId}
            id={filterId}
            filter={filter}
            columns={availableColumns}
            selectColumn={selectColumn}
            selectMethod={selectMethod}
            removeFilter={removeFilter}
            selectValue={selectValue}
            filterMethods={effectiveFilterMethods}
          />
        );
      })}
      {!singleFilter && (
        <Button variant="outline" size="sm" onClick={addFilter}>
          <PlusIcon className="h-4 w-4" />
          Add Filter
        </Button>
      )}
      <Button onClick={applyFilters}>{singleFilter ? "Apply Filter" : "Apply Filters"}</Button>
    </div>
  );
};

const TableFilteringItem = ({
  id,
  filter,
  columns,
  selectColumn,
  selectMethod,
  selectValue,
  removeFilter,
  filterMethods,
}: {
  id: string;
  filter: HeroUIFilter;
  columns: {
    id: string;
    label: string;
    type?: ColumnDataType | null;
    options?: { label: string; value: string }[] | null;
    endColumnId?: string | null;
    periodStartColumnId?: string | null;
    periodEndColumnId?: string | null;
  }[];
  selectColumn: (filterId: string, columnId: string) => void;
  selectMethod: (filterId: string, method: FilterMethod) => void;
  selectValue: (filterId: string, value: FilterValue) => void;
  removeFilter: (filterId: string) => void;
  filterMethods: FilterMethods;
}) => {
  const handleColumnChange = useCallback(
    (keys: any) => {
      const columnId = String(keys.currentKey);
      selectColumn(id, columnId);
    },
    [id, selectColumn]
  );

  const methodsForType = useMemo(() => {
    if (!filter.type) return [];

    // Period columns only support intersect method
    const isPeriodColumn = filter.columnId.endsWith("__period");
    if (isPeriodColumn) {
      const intersectMethod = filterMethods.date.find((m) => m.value === "intersect");
      return intersectMethod ? [intersectMethod] : [];
    }

    const baseMethods = filterMethods[filter.type as ColumnDataType] ?? [];
    const emptyMethods: FilterMethod[] = [
      { value: "isEmpty", label: "Is Empty", component: null },
      { value: "isNotEmpty", label: "Is Not Empty", component: null },
    ];

    if (filter.type !== "boolean" && filter.type !== "date") {
      return [...baseMethods, ...emptyMethods];
    }

    return baseMethods;
  }, [filter.type, filter.columnId, filter.method?.value, filterMethods]);

  const handleMethodChange = useCallback(
    (keys: any) => {
      if (!filter.type) return;
      // Use methodsForType instead of filterMethods to include dynamically added methods
      const method = methodsForType.find(
        (currentMethod: FilterMethod) => currentMethod.value === String(keys.currentKey)
      );
      if (method) {
        selectMethod(id, method);
      }
    },
    [id, filter.type, selectMethod, methodsForType]
  );

  const handleValueChange = useCallback(
    (value: FilterValue) => {
      selectValue(id, value);
    },
    [id, selectValue]
  );

  const methodSelect = useMemo(() => {
    if (!filter.type) return null;
    return (
      <Select
        size="sm"
        aria-label="Select Method"
        className="w-40 flex-shrink-0 text-sm"
        selectedKeys={filter.method?.value ? [filter.method.value] : []}
        onSelectionChange={handleMethodChange}
        popoverProps={{
          className: "w-auto min-w-max",
        }}
      >
        {methodsForType.map((method: FilterMethod) => (
          <SelectItem key={method.value} className="text-sm">
            {method.label}
          </SelectItem>
        ))}
      </Select>
    );
  }, [filter.type, filter.method?.value, methodsForType, handleMethodChange]);

  const filterValueComponent = useMemo(() => {
    if (!filter.method?.component) {
      return <div className="flex-1 min-w-0" />;
    }
    const component = filter.method.component as ComponentForFilterMethod;
    const ComponentFn =
      componentForFilterMethod[component as keyof typeof componentForFilterMethod];
    if (!ComponentFn) return <div className="flex-1 min-w-0" />;
    return ComponentFn(filter.value as any, handleValueChange, filter.options ?? []);
  }, [filter.method?.component, filter.value, filter.options, handleValueChange]);

  const columnSelectItems = useMemo(
    () =>
      columns.map((column) => (
        <SelectItem key={column.id} className="text-sm">
          {String(column.label)}
        </SelectItem>
      )),
    [columns]
  );

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex flex-1 items-center gap-2 min-w-0">
        <Select
          size="sm"
          aria-label="Select Column"
          className="w-40 flex-shrink-0 text-sm"
          selectedKeys={filter.columnId ? [filter.columnId] : []}
          onSelectionChange={handleColumnChange}
          popoverProps={{
            className: "w-auto min-w-max",
          }}
        >
          {columnSelectItems}
        </Select>
        {methodSelect}
        {filterValueComponent}
      </div>
      <Button variant="outline" size="sm" onClick={() => removeFilter(id)}>
        <XIcon className="h-4 w-4" />
      </Button>
    </div>
  );
};
