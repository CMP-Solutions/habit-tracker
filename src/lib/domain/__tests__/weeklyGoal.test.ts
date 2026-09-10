import { describe, it, expect } from "vitest";
import { groupIntoWeeks, evaluateWeek } from "../weeklyGoal";

const day = (date: string, success: boolean) => ({ date, success });

describe("groupIntoWeeks", () => {
  it("groups consecutive days into Monday-first weeks", () => {
    // 2026-09-07 is a Monday
    const entries = [
      day("2026-09-07", true),
      day("2026-09-08", true),
      day("2026-09-13", true), // Sunday, same week
      day("2026-09-14", false), // next Monday, new week
    ];
    const weeks = groupIntoWeeks(entries);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toHaveLength(3);
    expect(weeks[1]).toHaveLength(1);
  });

  it("returns an empty array for no entries", () => {
    expect(groupIntoWeeks([])).toEqual([]);
  });
});

describe("evaluateWeek", () => {
  it("succeeds when successful days meet the threshold", () => {
    const week = [
      day("2026-09-07", true),
      day("2026-09-08", true),
      day("2026-09-09", true),
      day("2026-09-10", false),
      day("2026-09-11", true),
      day("2026-09-12", false),
      day("2026-09-13", false),
    ];
    expect(evaluateWeek(week, 4)).toBe(true);
    expect(evaluateWeek(week, 5)).toBe(false);
  });
});
