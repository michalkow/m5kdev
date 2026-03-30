import dayjs from "dayjs";
import type React from "react";
import { Calendar as BigCalendar, type CalendarProps, dayjsLocalizer } from "react-big-calendar";
import * as dragAndDropModule from "react-big-calendar/lib/addons/dragAndDrop";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "./Calendar.css";
// FIXME: react-big calendar as peer dependency
type DragAndDropHoc = (Cal: typeof BigCalendar) => React.ComponentType<CalendarProps>;

/** react-big-calendar's DnD addon ships as CJS; Vite/Rollup default interop can nest `.default`. */
function resolveWithDragAndDrop(mod: unknown): DragAndDropHoc {
  if (typeof mod === "function") {
    return mod as DragAndDropHoc;
  }
  if (typeof mod !== "object" || mod === null) {
    throw new Error(
      "@m5kdev/web-ui Calendar: invalid react-big-calendar drag-and-drop module (expected object)."
    );
  }
  const exported = (mod as { default?: unknown }).default;
  if (typeof exported === "function") {
    return exported as DragAndDropHoc;
  }
  if (
    exported !== null &&
    typeof exported === "object" &&
    "default" in exported &&
    typeof (exported as { default: unknown }).default === "function"
  ) {
    return (exported as { default: DragAndDropHoc }).default;
  }
  throw new Error(
    "@m5kdev/web-ui Calendar: could not load react-big-calendar drag-and-drop addon (CJS/ESM interop)."
  );
}

const withDragAndDrop = resolveWithDragAndDrop(dragAndDropModule);
const DnDCalendar = withDragAndDrop(BigCalendar);
const localizer = dayjsLocalizer(dayjs);

type CalendarComponents = NonNullable<CalendarProps["components"]>;
export type CalendarEventRenderer = CalendarComponents extends { event?: infer T }
  ? Exclude<T, undefined>
  : never;

interface DragAndDropCalendarProps extends Omit<CalendarProps, "localizer"> {
  onEventDrop?: (args: { event: unknown; start: Date; end: Date }) => void;
  onEventResize?: (args: { event: unknown; start: Date; end: Date }) => void;
  onDragStart?: (args: { event: unknown; action: "move" | "resize"; direction?: unknown }) => void;
  dragFromOutsideItem?: () => unknown;
  onDropFromOutside?: (args: { start: Date; end: Date; allDay?: boolean }) => void;
  onDragOverFromOutside?: (event: React.DragEvent) => void;
  resizable?: boolean;
}

const TypedDnDCalendar = DnDCalendar as React.ComponentType<
  DragAndDropCalendarProps & { localizer: typeof localizer }
>;

export const Calendar = (props: DragAndDropCalendarProps) => (
  <TypedDnDCalendar {...props} localizer={localizer} />
);
