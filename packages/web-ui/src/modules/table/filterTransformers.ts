import type { DateValue, RangeValue, SharedSelection } from "@heroui/react";
import { CalendarDate, getLocalTimeZone, today } from "@internationalized/date";
import type { QueryFilter, QueryFilters } from "@m5kdev/commons/modules/schemas/query.schema";
import type { ColumnDataType, FilterMethod } from "@m5kdev/commons/modules/table/filter.types";
import { DateTime } from "luxon";

export type FilterValue =
  | string
  | number
  | string[]
  | DateValue
  | RangeValue<DateValue>
  | boolean
  | SharedSelection
  | null;

export interface HeroUIFilter {
  columnId: string;
  type: ColumnDataType | null;
  value: FilterValue;
  method: FilterMethod | null;
  options?: { label: string; value: string }[] | null;
  endColumnId?: string | null;
  periodStartColumnId?: string | null;
  periodEndColumnId?: string | null;
}

/**
 * Convert CalendarDate to UTC ISO string at midnight UTC
 */
export const calendarDateToUTC = (date: CalendarDate): string => {
  return DateTime.utc(date.year, date.month, date.day).toISO() ?? "";
};

/**
 * Convert CalendarDate to end of day UTC ISO string
 */
export const calendarDateToEndOfDayUTC = (date: CalendarDate): string => {
  return DateTime.utc(date.year, date.month, date.day).endOf("day").toISO() ?? "";
};

/**
 * Parse UTC ISO string to CalendarDate (preserves UTC date, no timezone shift)
 */
const parseUTCToCalendarDate = (isoString: string): CalendarDate | null => {
  try {
    const dt = DateTime.fromISO(isoString, { zone: "utc" });
    if (!dt.isValid) return null;
    return new CalendarDate(dt.year, dt.month, dt.day);
  } catch {
    return null;
  }
};

/**
 * Convert any date filter method from URL to a RangeValue for DateRangePicker
 * Handles: on, before, after, between, intersect
 * Parses UTC ISO strings as UTC to avoid timezone shifts
 */
export const dateFilterToRangeValue = (
  filters: QueryFilters | undefined,
  columnId: string
): RangeValue<DateValue> | null => {
  if (!filters) return null;

  const filter = filters.find((f) => f.columnId === columnId);
  if (!filter || filter.type !== "date") return null;

  const todayDate = today(getLocalTimeZone());
  const epochStart = new CalendarDate(1970, 1, 1);

  try {
    switch (filter.method) {
      case "on": {
        // Same day range
        if (typeof filter.value !== "string" || !filter.value) return null;
        const day = parseUTCToCalendarDate(filter.value);
        if (!day) return null;
        return {
          start: day as unknown as DateValue,
          end: day as unknown as DateValue,
        } as RangeValue<DateValue>;
      }
      case "before": {
        // [epochStart, selectedDay]
        if (typeof filter.value !== "string" || !filter.value) return null;
        const day = parseUTCToCalendarDate(filter.value);
        if (!day) return null;
        return {
          start: epochStart as unknown as DateValue,
          end: day as unknown as DateValue,
        } as RangeValue<DateValue>;
      }
      case "after": {
        // [selectedDay, today]
        if (typeof filter.value !== "string" || !filter.value) return null;
        const day = parseUTCToCalendarDate(filter.value);
        if (!day) return null;
        return {
          start: day as unknown as DateValue,
          end: todayDate as unknown as DateValue,
        } as RangeValue<DateValue>;
      }
      case "between":
      case "intersect": {
        // [value, valueTo]
        if (typeof filter.value !== "string" || !filter.value || !filter.valueTo) return null;
        const startDate = parseUTCToCalendarDate(filter.value);
        const endDate = parseUTCToCalendarDate(filter.valueTo);
        if (!startDate || !endDate) return null;
        return {
          start: startDate as unknown as DateValue,
          end: endDate as unknown as DateValue,
        } as RangeValue<DateValue>;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
};

/**
 * Transform filters from backend format (QueryFilter[]) to HeroUI format (HeroUIFilter[])
 * Used when loading filters from URL/backend to populate HeroUI components
 */
export const transformFiltersToHeroUI = (
  filtersToTransform: QueryFilters,
  columnsMap: Map<
    string,
    {
      id: string;
      label: string;
      type?: ColumnDataType | null;
      options?: { label: string; value: string }[] | null;
      endColumnId?: string | null;
      periodStartColumnId?: string | null;
      periodEndColumnId?: string | null;
    }
  >,
  filterMethods: Record<ColumnDataType, FilterMethod[]>
): HeroUIFilter[] => {
  return filtersToTransform.map((filter) => {
    let value: FilterValue = null;
    let method: FilterMethod | null = null;
    let columnId = filter.columnId;

    // Check if this intersect filter should map to Period pseudo-column
    if (filter.type === "date" && filter.method === "intersect" && filter.endColumnId) {
      const periodColumnId = `${filter.columnId}__period`;
      const periodColumn = columnsMap.get(periodColumnId);
      if (periodColumn) {
        // Map to Period pseudo-column
        columnId = periodColumnId;
      }
    }

    // Find the method object from the methods configuration
    if (filter.type) {
      const availableMethods = filterMethods[filter.type as ColumnDataType];
      const methodObj = availableMethods?.find((m: FilterMethod) => m.value === filter.method);
      if (methodObj) {
        method = methodObj;
      } else if (filter.method === "isEmpty" || filter.method === "isNotEmpty") {
        // Handle isEmpty/isNotEmpty even if not in the provided method list
        method = {
          value: filter.method,
          label: filter.method === "isEmpty" ? "Is Empty" : "Is Not Empty",
          component: null,
        };
      }
    }

    // Transform value based on type
    switch (filter.type) {
      case "string":
        value = filter.value as string;
        break;
      case "number":
        value = filter.value as number;
        break;
      case "date":
        // Use the shared helper for range conversion, or parse single dates as UTC
        if (filter.method === "between" || filter.method === "intersect") {
          // For range methods, use the helper function
          const range = dateFilterToRangeValue([filter], filter.columnId);
          value = range;
        } else {
          // Single date value: parse UTC ISO string and extract UTC calendar date
          if (typeof filter.value === "string" && filter.value) {
            const day = parseUTCToCalendarDate(filter.value);
            value = day ? (day as unknown as DateValue) : null;
          } else {
            value = null;
          }
        }
        break;
      case "boolean":
        value = filter.value as boolean;
        break;
      case "enum":
        if (filter.method === "oneOf" && Array.isArray(filter.value)) {
          // Multi-select: array of strings to SharedSelection (Set)
          value = new Set(filter.value) as SharedSelection;
        } else {
          // Single select: string to SharedSelection with currentKey
          const selection = new Set([filter.value as string]) as SharedSelection;
          // Set currentKey property
          Object.defineProperty(selection, "currentKey", {
            value: filter.value as string,
            writable: true,
            enumerable: false,
            configurable: true,
          });
          value = selection;
        }
        break;
      case "jsonArray":
        if (filter.method === "oneOf" && Array.isArray(filter.value)) {
          value = new Set(filter.value) as SharedSelection;
        } else if (Array.isArray(filter.value) && filter.value.length > 0) {
          const first = filter.value[0] as string;
          const selection = new Set([first]) as SharedSelection;
          Object.defineProperty(selection, "currentKey", {
            value: first,
            writable: true,
            enumerable: false,
            configurable: true,
          });
          value = selection;
        } else {
          value = filter.value;
        }
        break;
      default:
        value = filter.value;
    }

    const column = columnsMap.get(columnId);
    return {
      columnId,
      type: filter.type,
      value,
      method,
      options: column?.options ?? null,
      endColumnId: column?.endColumnId ?? null,
      periodStartColumnId: column?.periodStartColumnId ?? null,
      periodEndColumnId: column?.periodEndColumnId ?? null,
    };
  });
};

/**
 * Transform filters from HeroUI format (HeroUIFilter[]) to backend format (QueryFilter[])
 * Used when applying filters to send to backend/URL
 */
export const transformFiltersFromHeroUI = (filters: HeroUIFilter[]): QueryFilters => {
  const filtersToApply: QueryFilters = [];

  for (const filter of filters) {
    let value: FilterValue | undefined;
    let valueTo: FilterValue | undefined;

    // Handle isEmpty/isNotEmpty methods - they don't need a value
    if (filter.method?.value === "isEmpty" || filter.method?.value === "isNotEmpty") {
      if (filter.columnId === "") continue;

      const result: QueryFilter = {
        columnId: filter.columnId,
        type: filter.type as ColumnDataType,
        method: filter.method.value,
        value: "",
      };
      filtersToApply.push(result);
      continue;
    }

    // Handle Period pseudo-column: map to intersect on real columns
    const isPeriodColumn = filter.columnId.endsWith("__period");
    const actualColumnId =
      isPeriodColumn && filter.periodStartColumnId ? filter.periodStartColumnId : filter.columnId;
    const actualEndColumnId =
      isPeriodColumn && filter.periodEndColumnId ? filter.periodEndColumnId : filter.endColumnId;

    switch (filter.type) {
      case "date":
        if (
          filter.method?.value === "between" ||
          filter.method?.value === "intersect" ||
          isPeriodColumn
        ) {
          const range = filter.value as RangeValue<DateValue>;
          if (range?.start && range?.end) {
            value = calendarDateToUTC(range.start as unknown as CalendarDate);
            valueTo = calendarDateToUTC(range.end as unknown as CalendarDate);
          }
        } else {
          const dateValue = filter.value as unknown as CalendarDate;
          if (dateValue?.year) {
            value = calendarDateToUTC(dateValue);
          }
        }
        break;
      case "enum": {
        const selection = filter.value as SharedSelection;
        if (selection) {
          value =
            filter.method?.value === "oneOf"
              ? Array.from(selection).map(String)
              : String(selection.currentKey);
        }
        break;
      }
      case "jsonArray": {
        const selection = filter.value as SharedSelection;
        if (selection) {
          value =
            filter.method?.value === "oneOf"
              ? Array.from(selection).map(String)
              : [String(selection.currentKey)];
        }
        break;
      }
      default:
        value = filter.value;
    }

    // Skip filters without valid values
    if (!value || value === "" || filter.columnId === "") continue;
    if (
      (filter.type === "enum" || filter.type === "jsonArray") &&
      Array.isArray(value) &&
      value.length === 0
    ) {
      continue;
    }

    // For Period columns, always use intersect method
    const actualMethod = isPeriodColumn ? "intersect" : (filter.method as FilterMethod).value;

    const result: QueryFilter = {
      columnId: actualColumnId,
      type: filter.type as ColumnDataType,
      method: actualMethod,
      value: value as string | number | boolean | string[],
      ...(valueTo && { valueTo: valueTo as string }),
      ...(actualMethod === "intersect" && actualEndColumnId
        ? { endColumnId: actualEndColumnId }
        : {}),
    };
    filtersToApply.push(result);
  }

  return filtersToApply;
};
