import type { DateValue, RangeValue } from "@heroui/react";
import { CalendarDate, getLocalTimeZone, parseAbsolute } from "@internationalized/date";
import type { QueryFilter } from "@m5kdev/commons/modules/schemas/query.schema";
import { DateTime } from "luxon";

/**
 * Convert CalendarDate to UTC ISO string at midnight UTC
 */
export const calendarDateToUTC = (date: CalendarDate): string => {
  return DateTime.utc(date.year, date.month, date.day).toISO() ?? "";
};

/**
 * Convert CalendarDate to UTC ISO string at end of day UTC
 */
export const calendarDateToUTCEndOfDay = (date: CalendarDate): string => {
  return DateTime.utc(date.year, date.month, date.day).endOf("day").toISO() ?? "";
};

/**
 * Convert RangeValue<DateValue> to URL string format "startISO,endISO"
 */
export const rangeToUrlString = (range: RangeValue<DateValue> | null): string | null => {
  if (!range || !range.start || !range.end) return null;

  const start = range.start as unknown as CalendarDate;
  const end = range.end as unknown as CalendarDate;

  if (!start?.year || !end?.year) return null;

  // Format as ISO date strings (YYYY-MM-DD)
  const startISO = `${start.year}-${String(start.month).padStart(2, "0")}-${String(start.day).padStart(2, "0")}`;
  const endISO = `${end.year}-${String(end.month).padStart(2, "0")}-${String(end.day).padStart(2, "0")}`;

  return `${startISO},${endISO}`;
};

/**
 * Convert URL string "startISO,endISO" to RangeValue<DateValue>
 */
export const urlStringToRange = (value: string | null): RangeValue<DateValue> | null => {
  if (!value) return null;

  const [startISO, endISO] = value.split(",");
  if (!startISO || !endISO) return null;

  const tz = getLocalTimeZone();

  // Parse ISO date strings using parseAbsolute for proper timezone handling
  const startZoned = parseAbsolute(`${startISO}T00:00:00Z`, tz);
  const endZoned = parseAbsolute(`${endISO}T00:00:00Z`, tz);

  if (!startZoned || !endZoned) return null;

  const startDate = new CalendarDate(startZoned.year, startZoned.month, startZoned.day);
  const endDate = new CalendarDate(endZoned.year, endZoned.month, endZoned.day);

  return {
    start: startDate as unknown as DateValue,
    end: endDate as unknown as DateValue,
  } as RangeValue<DateValue>;
};

/**
 * Convert date range to QueryFilter format
 */
export const dateRangeToFilter = (
  dateRange: RangeValue<DateValue> | null,
  columnId = "startedAt"
): QueryFilter | null => {
  if (!dateRange || !dateRange.start || !dateRange.end) return null;

  const start = dateRange.start as unknown as CalendarDate;
  const end = dateRange.end as unknown as CalendarDate;

  if (!start?.year || !end?.year) return null;

  const startISO = calendarDateToUTC(start);
  const endISO = calendarDateToUTCEndOfDay(end);

  return {
    columnId,
    type: "date",
    method: "between",
    value: startISO,
    valueTo: endISO,
  };
};
