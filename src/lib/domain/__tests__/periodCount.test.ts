import { describe, it, expect } from "vitest";
import { groupIntoCalendarPeriods, evaluatePeriod, periodBounds } from "../periodCount";

const day = (date: string, success: boolean) => ({ date, success });

describe("groupIntoCalendarPeriods", () => {
  it("groups by week when unit is week", () => {
    const entries = [
      day("2026-09-07", true), // Monday
      day("2026-09-08", true),
      day("2026-09-14", false), // next Monday
    ];
    const periods = groupIntoCalendarPeriods(entries, "week");
    expect(periods).toHaveLength(2);
    expect(periods[0]).toHaveLength(2);
    expect(periods[1]).toHaveLength(1);
  });

  it("groups by calendar month when unit is month", () => {
    const entries = [
      day("2026-09-01", true),
      day("2026-09-30", true),
      day("2026-10-01", false),
    ];
    const periods = groupIntoCalendarPeriods(entries, "month");
    expect(periods).toHaveLength(2);
    expect(periods[0]).toHaveLength(2);
    expect(periods[1]).toHaveLength(1);
  });

  it("returns an empty array for no entries", () => {
    expect(groupIntoCalendarPeriods([], "week")).toEqual([]);
    expect(groupIntoCalendarPeriods([], "month")).toEqual([]);
  });
});

describe("evaluatePeriod", () => {
  it("succeeds when successful days meet the target", () => {
    const period = [day("2026-09-01", true), day("2026-09-02", true), day("2026-09-03", false)];
    expect(evaluatePeriod(period, 2)).toBe(true);
    expect(evaluatePeriod(period, 3)).toBe(false);
  });
});

describe("periodBounds", () => {
  it("returns Monday-Sunday for a week unit", () => {
    // 2026-09-09 is a Wednesday
    const { start, end } = periodBounds(new Date("2026-09-09T00:00:00Z"), "week");
    expect(start.toISOString().slice(0, 10)).toBe("2026-09-07"); // Monday
    expect(end.toISOString().slice(0, 10)).toBe("2026-09-13"); // Sunday
  });

  it("returns the first-to-last day of the month for a month unit", () => {
    const { start, end } = periodBounds(new Date("2026-09-09T00:00:00Z"), "month");
    expect(start.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(end.toISOString().slice(0, 10)).toBe("2026-09-30");
  });
});
