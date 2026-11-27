import type { supportCalendarSchema } from "@m5kdev/commons/modules/support/support.schema";
import type { z } from "zod";
export function supportOpenNow(
  calendar: z.infer<typeof supportCalendarSchema> | null,
  now = new Date()
): boolean | null {
  if (!calendar) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: calendar.timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (kind: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === kind)?.value ?? "";
  if (calendar.holidays.includes(`${value("year")}-${value("month")}-${value("day")}`))
    return false;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value("weekday")),
    time = `${value("hour")}:${value("minute")}`;
  return calendar.weekly.some(
    (window) => window.day === day && time >= window.opens && time < window.closes
  );
}
