import { describe, it, expect } from "vitest";
import { isPeriodGoal, periodStreakStats, type GoalPeriodicityConfig } from "../goalStreak";
import type { DailyResult } from "../streak";

const DAILY: GoalPeriodicityConfig = { periodicity: "daily", weeklyThreshold: null, periodUnit: null, periodTarget: null };
const WEEKLY_3: GoalPeriodicityConfig = { periodicity: "weekly", weeklyThreshold: 3, periodUnit: null, periodTarget: null };
const PER_MONTH_5: GoalPeriodicityConfig = {
  periodicity: "count_per_period",
  weeklyThreshold: null,
  periodUnit: "month",
  periodTarget: 5,
};

// Weeks below start on Mondays: 2026-08-31, 09-07, 09-14, 09-21.
// "Today" is Wednesday 2026-09-23, inside the week of 09-21 (the open one).
const TODAY = new Date("2026-09-23T00:00:00Z");

/** Gapless daily results from `from` through TODAY, with the given dates marked as successes. */
function daysFrom(from: string, successes: string[]): DailyResult[] {
  const wins = new Set(successes);
  const out: DailyResult[] = [];
  const cursor = new Date(from + "T00:00:00Z");
  while (cursor <= TODAY) {
    const date = cursor.toISOString().slice(0, 10);
    out.push({ date, success: wins.has(date) });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

describe("isPeriodGoal", () => {
  it("is false for daily and true for weekly / count_per_period", () => {
    expect(isPeriodGoal(DAILY)).toBe(false);
    expect(isPeriodGoal(WEEKLY_3)).toBe(true);
    expect(isPeriodGoal(PER_MONTH_5)).toBe(true);
  });
});

describe("periodStreakStats", () => {
  it("returns null for daily goals", () => {
    expect(periodStreakStats(daysFrom("2026-09-14", []), DAILY, TODAY)).toBeNull();
  });

  it("counts successful days across consecutive successful weeks (3x/week for 3 weeks = 9)", () => {
    const results = daysFrom("2026-08-31", [
      "2026-08-31", "2026-09-02", "2026-09-04", // week 1: Mo/Mi/Fr
      "2026-09-07", "2026-09-09", "2026-09-11", // week 2
      "2026-09-14", "2026-09-16", "2026-09-18", // week 3
    ]);
    // Open week (09-21..) has no entries yet — it must not break the chain.
    expect(periodStreakStats(results, WEEKLY_3, TODAY)).toEqual({
      currentStreak: 9,
      longestStreak: 9,
      totalSuccessCount: 9,
    });
  });

  it("adds the successes already made in the still-open current week", () => {
    const results = daysFrom("2026-09-14", ["2026-09-14", "2026-09-16", "2026-09-18", "2026-09-21"]);
    expect(periodStreakStats(results, WEEKLY_3, TODAY)?.currentStreak).toBe(4);
  });

  it("a completed week that missed its target resets the streak but its days still count in the total", () => {
    const results = daysFrom("2026-08-31", [
      "2026-08-31", "2026-09-02", "2026-09-04", // week 1: met (3)
      "2026-09-07", // week 2: missed (1 of 3)
      "2026-09-14", "2026-09-16", "2026-09-18", // week 3: met (3)
    ]);
    expect(periodStreakStats(results, WEEKLY_3, TODAY)).toEqual({
      currentStreak: 3,
      longestStreak: 3,
      totalSuccessCount: 7,
    });
  });

  it("keeps the longest streak from before a break", () => {
    const results = daysFrom("2026-08-31", [
      "2026-08-31", "2026-09-02", "2026-09-04",
      "2026-09-07", "2026-09-09", "2026-09-11",
      // week 3 (09-14) missed entirely
    ]);
    expect(periodStreakStats(results, WEEKLY_3, TODAY)).toEqual({
      currentStreak: 0,
      longestStreak: 6,
      totalSuccessCount: 6,
    });
  });

  it("counts every successful day, including those above the target", () => {
    const results = daysFrom("2026-09-14", ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"]);
    expect(periodStreakStats(results, WEEKLY_3, TODAY)?.currentStreak).toBe(5);
  });

  it("works per calendar month for count_per_period(month)", () => {
    // 5 successes in August (met), 2 so far in the open September month.
    const results = daysFrom("2026-08-01", [
      "2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31",
      "2026-09-02", "2026-09-09",
    ]);
    expect(periodStreakStats(results, PER_MONTH_5, TODAY)).toEqual({
      currentStreak: 7,
      longestStreak: 7,
      totalSuccessCount: 7,
    });
  });
});
