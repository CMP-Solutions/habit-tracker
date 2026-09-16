import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { createGoal } from "../goals";
import { recordEntry, recordSkip } from "../entries";
import { getStats } from "../stats";

const utcToday = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const daysAgo = (n: number) => {
  const d = utcToday();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

describe("stats storage: getStats", () => {
  beforeEach(async () => {
    await db.goals.clear();
    await db.entries.clear();
    await db.milestones.clear();
  });

  it("returns an empty daily list and zeroed week when there are no goals", async () => {
    const { daily, week } = await getStats(30);
    expect(daily.every((d) => d.totalCount === 0)).toBe(true);
    expect(week).toEqual({ successCount: 0, totalCount: 0 });
  });

  it("counts a backfilled entry dated before the goal's own createdAt", async () => {
    // Regression, ported from the Prisma-era fix: a goal created "today" but
    // backfilled via the Woche grid for yesterday must still count toward
    // that day's totals — backfilled history is never rejected.
    const goal = await createGoal({ title: "Wasser trinken", type: "boolean", periodicity: "daily" });
    await recordEntry({ goalId: goal.id, date: daysAgo(1), done: true });

    const { daily } = await getStats(30);
    const yesterday = daily.find((d) => d.date === daysAgo(1));
    expect(yesterday).toEqual({ date: daysAgo(1), successCount: 1, totalCount: 1 });
  });

  it("excludes a goal from a day before it existed when no entry was backfilled", async () => {
    await createGoal({ title: "Neu heute", type: "boolean", periodicity: "daily" });
    const { daily } = await getStats(30);
    const yesterday = daily.find((d) => d.date === daysAgo(1));
    expect(yesterday).toEqual({ date: daysAgo(1), successCount: 0, totalCount: 0 });
  });

  it("aggregates the current week's totals across days from Monday through today, independent of the days range", async () => {
    const goal = await createGoal({ title: "Sport", type: "boolean", periodicity: "daily" });
    await recordEntry({ goalId: goal.id, date: daysAgo(0), done: true });

    // A short 7-day range must not truncate the week aggregation to less
    // than the actual Monday-through-today span if that span is longer.
    const { week } = await getStats(7);
    expect(week.successCount).toBeGreaterThanOrEqual(1);
    expect(week.totalCount).toBeGreaterThanOrEqual(1);
  });

  it("derives success from value >= targetValue for a quantitative goal", async () => {
    const goal = await createGoal({
      title: "10000 Schritte",
      type: "quantitative",
      unit: "Schritte",
      targetValue: 10000,
      periodicity: "daily",
    });
    await recordEntry({ goalId: goal.id, date: daysAgo(0), done: false, value: 12000 });

    const { daily } = await getStats(30);
    const today = daily.find((d) => d.date === daysAgo(0));
    expect(today?.successCount).toBe(1);
  });

  it("excludes a skipped day from both successCount and totalCount", async () => {
    const goal = await createGoal({ title: "Meditieren", type: "boolean", periodicity: "daily" });
    await recordSkip({ goalId: goal.id, date: daysAgo(0), reason: "Krank" });

    const { daily } = await getStats(30);
    const today = daily.find((d) => d.date === daysAgo(0));
    expect(today).toEqual({ date: daysAgo(0), successCount: 0, totalCount: 0 });
  });
});
