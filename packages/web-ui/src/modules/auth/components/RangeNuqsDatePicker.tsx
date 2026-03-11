import {
  DateRangePicker,
  type DateValue,
  type RangeValue,
  Select,
  SelectItem,
} from "@heroui/react";
import { CalendarDate, getLocalTimeZone, today } from "@internationalized/date";
import type { QueryFilters } from "@m5kdev/commons/modules/schemas/query.schema";
import { useNuqsQueryParams } from "@m5kdev/frontend/modules/table/hooks/useNuqsQueryParams";
import {
  calendarDateToEndOfDayUTC,
  calendarDateToUTC,
  dateFilterToRangeValue,
} from "@m5kdev/web-ui/modules/table/filterTransformers";
import { DateTime } from "luxon";
import { startTransition, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

type QuickRangeKey =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "lastYear";

const toCalendarDate = (dt: DateTime): CalendarDate => new CalendarDate(dt.year, dt.month, dt.day);

const isSameCalendarDate = (a: CalendarDate, b: CalendarDate) =>
  a.year === b.year && a.month === b.month && a.day === b.day;

export interface RangeNuqsDatePickerProps {
  /**
   * The column ID to use for the date filter (e.g., "startedAt")
   */
  columnId?: string;
  /**
   * The end column ID for range filters (e.g., "endedAt")
   */
  endColumnId?: string;
  /**
   * Label for the date range picker
   */
  dateRangeLabel?: string;
  /**
   * Label for the quick range selector
   */
  quickRangeLabel?: string;
  /**
   * Translation namespace for i18n
   */
  translationNamespace?: string;
  /**
   * Whether to show quick range selector
   */
  showQuickRange?: boolean;
  /**
   * Custom className for the container
   */
  className?: string;
}

export const RangeNuqsDatePicker = ({
  columnId = "startedAt",
  endColumnId = "endedAt",
  dateRangeLabel,
  quickRangeLabel,
  translationNamespace = "horecaai-app",
  showQuickRange = true,
  className,
}: RangeNuqsDatePickerProps) => {
  const { t } = useTranslation();
  const { filters, setFilters } = useNuqsQueryParams();

  const [quickRange, setQuickRange] = useState<QuickRangeKey | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Extract date range from filters using shared helper
  const dateRange = useMemo(() => {
    return dateFilterToRangeValue(filters, columnId);
  }, [filters, columnId]);

  const [localRange, setLocalRange] = useState<RangeValue<DateValue> | null | undefined>(dateRange);

  useEffect(() => {
    setLocalRange(dateRange);
  }, [dateRange]);

  const todayIso = DateTime.utc().toISODate();

  const quickRangeOptions = useMemo(() => {
    const now = DateTime.utc();
    const todayStart = now.startOf("day");
    const weekStart = todayStart.startOf("week");
    const monthStart = todayStart.startOf("month");
    const lastWeekStart = weekStart.minus({ weeks: 1 });
    const lastMonthStart = monthStart.minus({ months: 1 });
    const yearStart = todayStart.startOf("year");
    const lastYearStart = yearStart.minus({ years: 1 });

    const options: { key: QuickRangeKey; label: string; start: DateTime; end: DateTime }[] = [
      {
        key: "today",
        label: t(`${translationNamespace}:reports.quickRange.today`, { defaultValue: "Today" }),
        start: todayStart,
        end: todayStart,
      },
      {
        key: "yesterday",
        label: t(`${translationNamespace}:reports.quickRange.yesterday`, {
          defaultValue: "Yesterday",
        }),
        start: todayStart.minus({ days: 1 }),
        end: todayStart.minus({ days: 1 }),
      },
      {
        key: "last7",
        label: t(`${translationNamespace}:reports.quickRange.last7`, {
          defaultValue: "Last 7 days",
        }),
        start: todayStart.minus({ days: 6 }),
        end: todayStart,
      },
      {
        key: "last30",
        label: t(`${translationNamespace}:reports.quickRange.last30`, {
          defaultValue: "Last 30 days",
        }),
        start: todayStart.minus({ days: 29 }),
        end: todayStart,
      },
      {
        key: "thisWeek",
        label: t(`${translationNamespace}:reports.quickRange.thisWeek`, {
          defaultValue: "This week",
        }),
        start: weekStart,
        end: todayStart,
      },
      {
        key: "lastWeek",
        label: t(`${translationNamespace}:reports.quickRange.lastWeek`, {
          defaultValue: "Last week",
        }),
        start: lastWeekStart,
        end: lastWeekStart.plus({ days: 6 }),
      },
      {
        key: "thisMonth",
        label: t(`${translationNamespace}:reports.quickRange.thisMonth`, {
          defaultValue: "This month",
        }),
        start: monthStart,
        end: todayStart,
      },
      {
        key: "lastMonth",
        label: t(`${translationNamespace}:reports.quickRange.lastMonth`, {
          defaultValue: "Last month",
        }),
        start: lastMonthStart,
        end: lastMonthStart.endOf("month"),
      },
      {
        key: "thisYear",
        label: t(`${translationNamespace}:reports.quickRange.thisYear`, {
          defaultValue: "This year",
        }),
        start: yearStart,
        end: todayStart,
      },
      {
        key: "lastYear",
        label: t(`${translationNamespace}:reports.quickRange.lastYear`, {
          defaultValue: "Last year",
        }),
        start: lastYearStart,
        end: lastYearStart.endOf("year"),
      },
    ];

    return options.map((opt) => ({
      key: opt.key,
      label: opt.label,
      range: {
        start: toCalendarDate(opt.start),
        end: toCalendarDate(opt.end),
      },
    }));
  }, [t, todayIso, translationNamespace]);

  // Set default to "this month" on initial load if no date range is set
  useEffect(() => {
    if (hasInitialized || !setFilters) return;

    // Check if there's already a valid date range from URL
    if (dateRange) {
      setHasInitialized(true);
      return;
    }

    // No date range set, initialize to "this month"
    const thisMonthOption = quickRangeOptions.find((opt) => opt.key === "thisMonth");
    if (thisMonthOption) {
      setHasInitialized(true);
      setQuickRange("thisMonth");

      // Set filters directly for "this month" range
      const startDate = thisMonthOption.range.start;
      const endDate = thisMonthOption.range.end;

      const newFilters: QueryFilters = [
        ...(filters?.filter((f) => f.columnId !== columnId && f.columnId !== endColumnId) ?? []),
        {
          columnId,
          type: "date" as const,
          method: "intersect" as const,
          value: calendarDateToUTC(startDate),
          valueTo: calendarDateToEndOfDayUTC(endDate),
          endColumnId,
        },
      ];

      setFilters(newFilters);
    }
  }, [dateRange, columnId, endColumnId, quickRangeOptions, hasInitialized, setFilters]);

  useEffect(() => {
    // Don't sync quickRange if we're still initializing
    if (!hasInitialized) return;

    if (!dateRange?.start || !dateRange?.end) {
      setQuickRange(null);
      return;
    }

    const start = dateRange.start as unknown as CalendarDate;
    const end = dateRange.end as unknown as CalendarDate;

    const matches = quickRangeOptions.filter(
      (option) =>
        isSameCalendarDate(option.range.start, start) && isSameCalendarDate(option.range.end, end)
    );

    if (matches.length === 0) {
      setQuickRange(null);
      return;
    }

    // If the current quick range still matches, keep it
    const currentStillMatches = quickRange ? matches.find((m) => m.key === quickRange) : null;
    if (currentStillMatches) {
      return;
    }

    // Otherwise pick the highest-priority match to keep intent (week/month over last7 overlap)
    const priority: QuickRangeKey[] = [
      "today",
      "yesterday",
      "thisWeek",
      "lastWeek",
      "thisMonth",
      "lastMonth",
      "last7",
      "last30",
    ];
    const preferred =
      priority.map((key) => matches.find((m) => m.key === key)).find((m) => Boolean(m)) ??
      matches[0];

    setQuickRange(preferred?.key ?? null);
  }, [dateRange, quickRangeOptions, quickRange, hasInitialized]);

  // Handle date range changes
  const handleDateRangeChange = (range: RangeValue<DateValue> | null) => {
    if (!setFilters) return;

    if (range === null) {
      // Explicit clear — remove date filters
      const newFilters =
        filters?.filter((f) => f.columnId !== columnId && f.columnId !== endColumnId) ?? [];
      startTransition(() => setFilters(newFilters));
      return;
    }

    // Incomplete range (e.g. only start selected mid-calendar-selection) — keep current filters
    if (!range.start || !range.end) return;

    // Use intersect to find records where [startedAt, endedAt] overlaps with the selected range
    // This includes ongoing records (endedAt = NULL) and records that overlap the range
    const startDate = range.start as unknown as CalendarDate;
    const endDate = range.end as unknown as CalendarDate;

    const newFilters: QueryFilters = [
      ...(filters?.filter((f) => f.columnId !== columnId && f.columnId !== endColumnId) ?? []),
      {
        columnId,
        type: "date" as const,
        method: "intersect" as const,
        value: calendarDateToUTC(startDate),
        valueTo: calendarDateToEndOfDayUTC(endDate),
        endColumnId,
      },
    ];

    startTransition(() => setFilters(newFilters));
  };

  const handleQuickRangeChange = (key: QuickRangeKey | null) => {
    if (!key) {
      setQuickRange(null);
      return;
    }

    const option = quickRangeOptions.find((opt) => opt.key === key);
    if (!option) return;

    setQuickRange(key);
    handleDateRangeChange({
      start: option.range.start as unknown as DateValue,
      end: option.range.end as unknown as DateValue,
    });
  };

  return (
    <div className={`flex gap-4 flex-row ${className ?? ""}`}>
      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">
          {dateRangeLabel ??
            t(`${translationNamespace}:reports.dateRange`, { defaultValue: "Date range" })}
        </span>
        <DateRangePicker
          aria-label="Date range"
          value={(localRange as any) ?? undefined}
          onChange={setLocalRange}
          onBlur={() => {
            if (localRange !== undefined) {
              handleDateRangeChange(localRange);
            }
          }}
          className="w-[300px]"
          granularity="day"
          showMonthAndYearPickers
          maxValue={today(getLocalTimeZone()) as unknown as DateValue}
          popoverProps={{
            portalContainer: document.body,
            disableAnimation: true,
          }}
        />
      </div>
      {showQuickRange && (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">
            {quickRangeLabel ??
              t(`${translationNamespace}:reports.quickRange.label`, {
                defaultValue: "Quick range",
              })}
          </span>
          <Select
            selectedKeys={quickRange ? [quickRange] : []}
            onChange={(e) => handleQuickRangeChange((e.target.value as QuickRangeKey) ?? null)}
            className="w-[300px]"
            popoverProps={{
              portalContainer: document.body,
            }}
          >
            {quickRangeOptions.map((option) => (
              <SelectItem key={option.key}>{option.label}</SelectItem>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
};
