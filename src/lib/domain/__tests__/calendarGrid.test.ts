import { describe, it, expect } from "vitest";
import { monthGridDays, weekDays } from "../calendarGrid";

function toDateStrings(days: Date[]): string[] {
  return days.map((d) => d.toISOString().slice(0, 10));
}

describe("monthGridDays", () => {
  it("returns 42 days starting on the Monday on/before the 1st", () => {
    // September 2026 starts on a Tuesday.
    const days = monthGridDays(new Date("2026-09-15T00:00:00Z"));
    expect(days).toHaveLength(42);
    expect(toDateStrings(days)[0]).toBe("2026-08-31"); // Monday before Sep 1
  });

  it("returns consecutive days", () => {
    const days = monthGridDays(new Date("2026-09-15T00:00:00Z"));
    const strings = toDateStrings(days);
    expect(strings[1]).toBe("2026-09-01");
    expect(strings[41]).toBe("2026-10-11");
  });

  it("starts on the 1st itself when the month already starts on a Monday", () => {
    // June 2026 starts on a Monday.
    const days = monthGridDays(new Date("2026-06-10T00:00:00Z"));
    expect(toDateStrings(days)[0]).toBe("2026-06-01");
  });
});

describe("weekDays", () => {
  it("returns 7 consecutive days starting on Monday", () => {
    // 2026-09-16 is a Wednesday.
    const days = weekDays(new Date("2026-09-16T00:00:00Z"));
    expect(toDateStrings(days)).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
  });

  it("returns the same week when given a Monday", () => {
    const days = weekDays(new Date("2026-09-14T00:00:00Z"));
    expect(toDateStrings(days)[0]).toBe("2026-09-14");
  });

  it("returns the same week when given a Sunday", () => {
    const days = weekDays(new Date("2026-09-20T00:00:00Z"));
    expect(toDateStrings(days)[0]).toBe("2026-09-14");
  });
});
