import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { createCategory } from "../categories";
import { createGoal, listGoals, updateGoal, deleteGoal, listGoalsWithProgress, getGoalHistory } from "../goals";
import { recordEntry, recordSkip } from "../entries";

describe("goals storage", () => {
  beforeEach(async () => {
    await db.categories.clear();
    await db.goals.clear();
    await db.entries.clear();
  });

  it("creates a daily boolean goal with defaults", async () => {
    const goal = await createGoal({ title: "Keine Süßigkeiten", type: "boolean", periodicity: "daily" });
    expect(goal.id).toBeTruthy();
    expect(goal.title).toBe("Keine Süßigkeiten");
    expect(goal.type).toBe("boolean");
    expect(goal.periodicity).toBe("daily");
    expect(goal.archived).toBe(false);
    expect(goal.step).toBe(1);
    expect(goal.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("creates a quantitative goal with targetValue and unit", async () => {
    const goal = await createGoal({
      title: "3 Liter Wasser",
      type: "quantitative",
      unit: "Liter",
      targetValue: 3,
      periodicity: "daily",
    });
    expect(goal.targetValue).toBe(3);
    expect(goal.unit).toBe("Liter");
  });

  it("rejects a quantitative goal without targetValue", async () => {
    await expect(
      createGoal({ title: "Bad goal", type: "quantitative", periodicity: "daily" })
    ).rejects.toThrow("targetValue is required for quantitative goals.");
  });

  it("rejects a weekly goal without weeklyThreshold", async () => {
    await expect(
      createGoal({ title: "Bad goal", type: "boolean", periodicity: "weekly" })
    ).rejects.toThrow("weeklyThreshold is required for weekly goals.");
  });

  it("creates a count_per_period goal for a quantitative type", async () => {
    const goal = await createGoal({
      title: "3x pro Woche 10000 Schritte",
      type: "quantitative",
      unit: "Schritte",
      targetValue: 10000,
      periodicity: "count_per_period",
      periodUnit: "week",
      periodTarget: 3,
    });
    expect(goal.periodUnit).toBe("week");
    expect(goal.periodTarget).toBe(3);
  });

  it("rejects a count_per_period goal without a valid periodUnit", async () => {
    await expect(
      createGoal({ title: "Bad goal", type: "boolean", periodicity: "count_per_period", periodUnit: "day" as "week" | "month", periodTarget: 3 })
    ).rejects.toThrow("periodUnit must be 'week' or 'month'.");
  });

  it("rejects a categoryId that doesn't exist locally", async () => {
    await expect(
      createGoal({ title: "Bad goal", type: "boolean", periodicity: "daily", categoryId: "nonexistent" })
    ).rejects.toThrow("Invalid category.");
  });

  it("accepts a categoryId that exists locally", async () => {
    const category = await createCategory({ name: "Gesundheit", color: "#22c55e", icon: "heart" });
    const goal = await createGoal({ title: "Mit Kategorie", type: "boolean", periodicity: "daily", categoryId: category.id });
    expect(goal.categoryId).toBe(category.id);
  });

  it("persists an optional reminderTime and motivation, defaulting both to null", async () => {
    const withExtras = await createGoal({
      title: "Meditieren",
      type: "boolean",
      periodicity: "daily",
      reminderTime: "21:00",
      motivation: "Für den inneren Frieden.",
    });
    expect(withExtras.reminderTime).toBe("21:00");
    expect(withExtras.motivation).toBe("Für den inneren Frieden.");

    const withoutExtras = await createGoal({ title: "Lesen", type: "boolean", periodicity: "daily" });
    expect(withoutExtras.reminderTime).toBeNull();
    expect(withoutExtras.motivation).toBeNull();
  });

  it("lists only non-archived goals by default", async () => {
    const active = await createGoal({ title: "Aktiv", type: "boolean", periodicity: "daily" });
    const archived = await createGoal({ title: "Archiviert", type: "boolean", periodicity: "daily" });
    await db.goals.update(archived.id, { archived: true });

    const goals = await listGoals();
    expect(goals.map((g) => g.id)).toEqual([active.id]);
  });

  it("includes archived goals when includeArchived is true", async () => {
    const goal = await createGoal({ title: "Archiviert", type: "boolean", periodicity: "daily" });
    await db.goals.update(goal.id, { archived: true });

    const goals = await listGoals({ includeArchived: true });
    expect(goals.map((g) => g.id)).toEqual([goal.id]);
  });

  it("updates a goal's title", async () => {
    const goal = await createGoal({ title: "Alt", type: "boolean", periodicity: "daily" });
    const updated = await updateGoal(goal.id, { title: "Neu" });
    expect(updated.title).toBe("Neu");
  });

  it("switches a goal to count_per_period and validates periodUnit/periodTarget", async () => {
    const goal = await createGoal({ title: "Fitness", type: "boolean", periodicity: "daily" });
    const updated = await updateGoal(goal.id, { periodicity: "count_per_period", periodUnit: "week", periodTarget: 3 });
    expect(updated.periodicity).toBe("count_per_period");
    expect(updated.periodTarget).toBe(3);
  });

  it("rejects an update to count_per_period with an invalid periodUnit", async () => {
    const goal = await createGoal({ title: "Fitness", type: "boolean", periodicity: "daily" });
    await expect(
      updateGoal(goal.id, { periodicity: "count_per_period", periodUnit: "day" as "week" | "month", periodTarget: 3 })
    ).rejects.toThrow("periodUnit must be 'week' or 'month'.");
  });

  it("archives a goal via the archived flag", async () => {
    const goal = await createGoal({ title: "Sport", type: "boolean", periodicity: "daily" });
    const updated = await updateGoal(goal.id, { archived: true });
    expect(updated.archived).toBe(true);
  });

  it("deletes a goal with no entries", async () => {
    const goal = await createGoal({ title: "Ohne Einträge", type: "boolean", periodicity: "daily" });
    await deleteGoal(goal.id);
    expect(await db.goals.get(goal.id)).toBeUndefined();
  });

  it("refuses to delete a goal that has entries", async () => {
    const goal = await createGoal({ title: "Mit Einträgen", type: "boolean", periodicity: "daily" });
    await db.entries.add({ id: "e1", goalId: goal.id, date: "2026-09-10", done: true, value: null, skipped: false, skipReason: null });
    await expect(deleteGoal(goal.id)).rejects.toThrow("Goal has entries; archive it instead of deleting.");
    expect(await db.goals.get(goal.id)).toBeDefined();
  });

  it("includes today's entry so the dashboard can seed its checked state", async () => {
    const goal = await createGoal({ title: "Lesen", type: "boolean", periodicity: "daily" });
    const today = new Date().toISOString().slice(0, 10);
    await recordEntry({ goalId: goal.id, date: today, done: true });

    const goals = await listGoalsWithProgress();
    const found = goals.find((g) => g.id === goal.id);
    expect(found?.todayEntry).toEqual({ done: true, value: null, skipped: false, skipReason: null });
  });

  it("reports a null todayEntry when there is no check-in today", async () => {
    await createGoal({ title: "Laufen", type: "boolean", periodicity: "daily" });
    const goals = await listGoalsWithProgress();
    expect(goals[0].todayEntry).toBeNull();
  });

  it("exposes skipped/skipReason on todayEntry when today was skipped", async () => {
    const goal = await createGoal({ title: "Meditieren", type: "boolean", periodicity: "daily" });
    const today = new Date().toISOString().slice(0, 10);
    await recordSkip({ goalId: goal.id, date: today, reason: "Krank" });

    const [found] = await listGoalsWithProgress();
    expect(found.todayEntry).toEqual({ done: false, value: null, skipped: true, skipReason: "Krank" });
  });

  it("does not break or extend the streak when today is skipped", async () => {
    const goal = await createGoal({ title: "Meditieren", type: "boolean", periodicity: "daily" });
    const daysAgo = (n: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - n);
      return d.toISOString().slice(0, 10);
    };
    for (const n of [3, 2, 1]) {
      await recordEntry({ goalId: goal.id, date: daysAgo(n), done: true });
    }
    await recordSkip({ goalId: goal.id, date: daysAgo(0) });

    const [found] = await listGoalsWithProgress();
    expect(found.currentStreak).toBe(3);
  });

  it("does not count a skipped day toward period-target progress", async () => {
    const goal = await createGoal({
      title: "Sport",
      type: "boolean",
      periodicity: "count_per_period",
      periodUnit: "week",
      periodTarget: 3,
    });
    const today = new Date().toISOString().slice(0, 10);
    await recordSkip({ goalId: goal.id, date: today, reason: "Krank" });

    const [found] = await listGoalsWithProgress();
    expect(found.periodProgress?.current).toBe(0);
  });

  it("includes periodProgress for a count_per_period goal", async () => {
    const goal = await createGoal({
      title: "Fitness",
      type: "boolean",
      periodicity: "count_per_period",
      periodUnit: "week",
      periodTarget: 3,
    });
    const today = new Date();
    const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    await recordEntry({ goalId: goal.id, date: monday.toISOString().slice(0, 10), done: true });

    const goals = await listGoalsWithProgress();
    const found = goals.find((g) => g.id === goal.id);
    expect(found?.periodProgress).toEqual({ current: 1, target: 3 });
  });

  it("returns periodProgress null for a non-count_per_period goal", async () => {
    await createGoal({ title: "Daily thing", type: "boolean", periodicity: "daily" });
    const goals = await listGoalsWithProgress();
    const daily = goals.find((g) => g.title === "Daily thing");
    expect(daily?.periodProgress).toBeNull();
  });

  it("includes the goal's category as { name, color } when it has one", async () => {
    const category = await createCategory({ name: "Gesundheit", color: "#22c55e", icon: "heart" });
    const goal = await createGoal({ title: "Wasser trinken", type: "boolean", periodicity: "daily", categoryId: category.id });

    const goals = await listGoalsWithProgress();
    expect(goals.find((g) => g.id === goal.id)?.category).toEqual({ name: "Gesundheit", color: "#22c55e" });
  });

  it("returns null category for a goal without one", async () => {
    const goal = await createGoal({ title: "Ohne Kategorie", type: "boolean", periodicity: "daily" });
    const goals = await listGoalsWithProgress();
    expect(goals.find((g) => g.id === goal.id)?.category).toBeNull();
  });

  it("counts a backfilled entry dated before the goal's own createdAt toward the streak", async () => {
    // Regression guard, ported from the Prisma-era fix: a goal created
    // "today" but backfilled for yesterday must still extend the streak.
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const goal = await createGoal({ title: "Wasser trinken", type: "boolean", periodicity: "daily" });
    await recordEntry({ goalId: goal.id, date: yesterday, done: true });
    await recordEntry({ goalId: goal.id, date: today, done: true });

    const goals = await listGoalsWithProgress();
    expect(goals.find((g) => g.id === goal.id)?.currentStreak).toBe(2);
  });

  it("returns a gapless day series from goal creation through today, and rejects an unknown id", async () => {
    const goal = await createGoal({ title: "Sport", type: "boolean", periodicity: "daily" });
    const day4Ago = new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10);
    const day1Ago = new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10);
    await db.goals.update(goal.id, { createdAt: day4Ago });
    await recordEntry({ goalId: goal.id, date: day4Ago, done: true });
    await recordEntry({ goalId: goal.id, date: day1Ago, done: true });

    const history = await getGoalHistory(goal.id);
    expect(history.results).toHaveLength(5); // day4Ago..today inclusive
    expect(history.results[0].success).toBe(true);
    expect(history.results[4].success).toBe(false); // today, unchecked

    await expect(getGoalHistory("nonexistent")).rejects.toThrow("Not found");
  });

  it("counts a backfilled entry dated before the goal's own createdAt in history and streak", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const goal = await createGoal({ title: "Wasser trinken", type: "boolean", periodicity: "daily" });
    await recordEntry({ goalId: goal.id, date: yesterday, done: true });
    await recordEntry({ goalId: goal.id, date: today, done: true });

    const history = await getGoalHistory(goal.id);
    expect(history.results.map((r) => r.date)).toEqual([yesterday, today]);
    expect(history.currentStreak).toBe(2);
    expect(history.totalSuccessCount).toBe(2);
    expect(history.entryCount).toBe(2);
  });

  describe("streak granularity for weekly/count_per_period goals", () => {
    function mondayOfWeeksAgo(weeksAgo: number): Date {
      const today = new Date();
      const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
      monday.setUTCDate(monday.getUTCDate() - weeksAgo * 7);
      return monday;
    }

    it("counts a streak of successful weeks, not raw days, for a weekly goal", async () => {
      // Regression guard for the bug where the displayed streak was computed
      // on raw daily gaps instead of period success — a goal checked in only
      // Mon/Wed/Fri every week (meeting weeklyThreshold: 3) looked like a
      // streak of ~1 day instead of 4 successful weeks.
      const goal = await createGoal({ title: "Fitness", type: "boolean", periodicity: "weekly", weeklyThreshold: 3 });

      for (let weeksAgo = 4; weeksAgo >= 1; weeksAgo--) {
        const monday = mondayOfWeeksAgo(weeksAgo);
        for (const offset of [0, 2, 4]) {
          const d = new Date(monday);
          d.setUTCDate(d.getUTCDate() + offset);
          await recordEntry({ goalId: goal.id, date: d.toISOString().slice(0, 10), done: true });
        }
      }

      const goals = await listGoalsWithProgress();
      expect(goals.find((g) => g.id === goal.id)?.currentStreak).toBe(4);

      const history = await getGoalHistory(goal.id);
      expect(history.currentStreak).toBe(4);
      expect(history.totalSuccessCount).toBe(4); // 4 successful weeks, not 12 successful days
    });

    it("counts a streak of successful periods for a count_per_period(week) goal", async () => {
      const goal = await createGoal({
        title: "Sport",
        type: "boolean",
        periodicity: "count_per_period",
        periodUnit: "week",
        periodTarget: 2,
      });

      for (let weeksAgo = 3; weeksAgo >= 1; weeksAgo--) {
        const monday = mondayOfWeeksAgo(weeksAgo);
        for (const offset of [0, 3]) {
          const d = new Date(monday);
          d.setUTCDate(d.getUTCDate() + offset);
          await recordEntry({ goalId: goal.id, date: d.toISOString().slice(0, 10), done: true });
        }
      }

      const goals = await listGoalsWithProgress();
      expect(goals.find((g) => g.id === goal.id)?.currentStreak).toBe(3);
    });

    it("extends the streak by one when the still-open current week already met its threshold", async () => {
      // weeklyThreshold: 1 keeps this deterministic regardless of which
      // weekday the test happens to run on — a single check-in today is
      // always enough to already satisfy the current (incomplete) week.
      const goal = await createGoal({ title: "Fitness", type: "boolean", periodicity: "weekly", weeklyThreshold: 1 });

      const priorMonday = mondayOfWeeksAgo(1);
      await recordEntry({ goalId: goal.id, date: priorMonday.toISOString().slice(0, 10), done: true });
      const today = new Date().toISOString().slice(0, 10);
      await recordEntry({ goalId: goal.id, date: today, done: true });

      const goals = await listGoalsWithProgress();
      expect(goals.find((g) => g.id === goal.id)?.currentStreak).toBe(2);

      const history = await getGoalHistory(goal.id);
      expect(history.currentStreak).toBe(2);
    });

    it("rejects updateGoal switching to weekly without a weeklyThreshold", async () => {
      const goal = await createGoal({ title: "Sport", type: "boolean", periodicity: "daily" });
      await expect(updateGoal(goal.id, { periodicity: "weekly" })).rejects.toThrow(
        "weeklyThreshold is required for weekly goals."
      );
    });
  });
});
