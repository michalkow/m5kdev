import dayjs from "dayjs";
import type React from "react";
import { Calendar as BigCalendar, type CalendarProps, dayjsLocalizer } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "./Calendar.css";

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
