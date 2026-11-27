import { supportOpenNow } from "../support.calendar";

it("uses the configured timezone, exclusive closing boundary and local holiday date", () => {
  const calendar = {
    timeZone: "Europe/Warsaw",
    weekly: [{ day: 1, opens: "09:00", closes: "17:00" }],
    holidays: [],
  };
  expect(supportOpenNow(calendar, new Date("2026-06-01T07:00:00Z"))).toBe(true);
  expect(supportOpenNow(calendar, new Date("2026-06-01T15:00:00Z"))).toBe(false);
  expect(
    supportOpenNow({ ...calendar, holidays: ["2026-06-01"] }, new Date("2026-06-01T07:00:00Z"))
  ).toBe(false);
  expect(supportOpenNow(null)).toBeNull();
});
