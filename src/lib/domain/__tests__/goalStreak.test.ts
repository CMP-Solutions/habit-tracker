import { describe, it, expect } from "vitest";
import { evaluationResultsForGoal, currentPeriodStart, currentPeriodAlreadySucceeded, type GoalPeriodicityConfig } from "../goalStreak";
import type { DailyResult } from "../streak";

const DAILY: GoalPeriodicityConfig = { periodicity: "daily", weeklyThreshold: null, periodUnit: null, periodTarget: null };
const WEEKLY_3: GoalPeriodicityConfig = { periodicity: "weekly", weeklyThreshold: 3, periodUnit: null, periodTarget: null };
const COUNT_PER_WEEK_2: GoalPeriodicityConfig = {
  periodicity: "count_per_period",
  weeklyThreshold: null,
  periodUnit: "week",
  periodTarget: 2,
};
const COUNT_PER_MONTH_5: GoalPeriodicityConfig = {
  periodicity: "count_per_period",
  weeklyThreshold: null,
  periodUnit: "month",
  periodTarget: 5,
};

function days(pattern: Record<string, boolean>): DailyResult[] {
  return Object.entries(pattern).map(([date, success]) => ({ date, success }));
}

describe("evaluationResultsForGoal", () => {
  it("passes daily goals through unchanged", () => {
    const daily = days({ "2026-09-01": true, "2026-09-02": false });
    expect(evaluationResultsForGoal(daily, DAILY)).toEqual(daily);
  });

  it("groups a weekly goal into one result per calendar week", () => {
    // 2026-09-07 is a Monday. Week 1 has 3 successes (meets threshold 3),
    // week 2 has only 2 (below threshold 3).
    const daily = days({
      "2026-09-07": true,
      "2026-09-08": false,
      "2026-09-09": true,
      "2026-09-10": false,
      "2026-09-11": true,
      "2026-09-12": false,
      "2026-09-13": false,
      "2026-09-14": true,
      "2026-09-15": true,
      "2026-09-16": false,
      "2026-09-17": false,
      "2026-09-18": false,
      "2026-09-19": false,
      "2026-09-20": false,
    });
    const result = evaluationResultsForGoal(daily, WEEKLY_3);
    expect(result).toEqual([
      { date: "2026-09-07", success: true },
      { date: "2026-09-14", success: false },
    ]);
  });

  it("groups a count_per_period(week) goal the same way as weekly", () => {
    const daily = days({
      "2026-09-07": true,
      "2026-09-08": true,
      "2026-09-09": false,
    });
    const result = evaluationResultsForGoal(daily, COUNT_PER_WEEK_2);
    expect(result).toEqual([{ date: "2026-09-07", success: true }]);
  });

  it("groups a count_per_period(month) goal by calendar month", () => {
    const daily = days({
      "2026-09-01": true,
      "2026-09-15": true,
      "2026-09-28": true,
      "2026-09-29": true,
      "2026-09-30": true,
      "2026-10-01": true,
    });
    const result = evaluationResultsForGoal(daily, COUNT_PER_MONTH_5);
    expect(result).toEqual([
      { date: "2026-09-01", success: true }, // 5 successes in September, meets target 5
      { date: "2026-10-01", success: false }, // 1 success in October, below target 5
    ]);
  });
});

describe("currentPeriodStart", () => {
  it("returns null for daily goals", () => {
    expect(currentPeriodStart(new Date("2026-09-16T00:00:00Z"), DAILY)).toBeNull();
  });

  it("returns the Monday of the current week for weekly goals", () => {
    // 2026-09-16 is a Wednesday.
    const start = currentPeriodStart(new Date("2026-09-16T00:00:00Z"), WEEKLY_3);
    expect(start?.toISOString().slice(0, 10)).toBe("2026-09-14");
  });

  it("returns the 1st of the current month for count_per_period(month) goals", () => {
    const start = currentPeriodStart(new Date("2026-09-16T00:00:00Z"), COUNT_PER_MONTH_5);
    expect(start?.toISOString().slice(0, 10)).toBe("2026-09-01");
  });
});

describe("currentPeriodAlreadySucceeded", () => {
  it("returns false for daily goals (no period concept)", () => {
    expect(currentPeriodAlreadySucceeded(days({ "2026-09-16": true }), DAILY)).toBe(false);
  });

  it("returns true once enough successes have accumulated this period", () => {
    const soFar = days({ "2026-09-14": true, "2026-09-15": false, "2026-09-16": true, "2026-09-17": true });
    expect(currentPeriodAlreadySucceeded(soFar, WEEKLY_3)).toBe(true);
  });

  it("returns false when the period hasn't met its target yet", () => {
    const soFar = days({ "2026-09-14": true, "2026-09-15": false });
    expect(currentPeriodAlreadySucceeded(soFar, WEEKLY_3)).toBe(false);
  });

  it("returns false for an empty period with no entries yet", () => {
    expect(currentPeriodAlreadySucceeded([], WEEKLY_3)).toBe(false);
  });
});
