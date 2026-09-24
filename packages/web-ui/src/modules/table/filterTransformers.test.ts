import { CalendarDate } from "@internationalized/date";
import type { DateValue } from "@react-types/calendar";
import type { RangeValue } from "@react-types/shared";

import { calendarDateToEndOfDayUTC, transformFiltersFromHeroUI } from "./filterTransformers";

describe("transformFiltersFromHeroUI", () => {
  it("writes between/intersect valueTo as end of the selected end day", () => {
    const start = new CalendarDate(2026, 6, 1);
    const end = new CalendarDate(2026, 9, 1);
    const range = {
      start: start as unknown as DateValue,
      end: end as unknown as DateValue,
    } as RangeValue<DateValue>;

    const [filter] = transformFiltersFromHeroUI([
      {
        columnId: "startedAt",
        type: "date",
        value: range,
        method: { value: "between", label: "Between", component: "range" },
        options: null,
        endColumnId: null,
        periodStartColumnId: null,
        periodEndColumnId: null,
      },
    ]);

    expect(filter).toMatchObject({
      columnId: "startedAt",
      type: "date",
      method: "between",
      value: "2026-06-01T00:00:00.000Z",
    });
    expect(filter.valueTo).toBe(calendarDateToEndOfDayUTC(end));
    expect(filter.valueTo).toBe("2026-09-01T23:59:59.999Z");
  });
});
