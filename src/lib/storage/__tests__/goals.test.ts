import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { createCategory } from "../categories";
import { createGoal, listGoals, updateGoal, deleteGoal } from "../goals";

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
    await db.entries.add({ id: "e1", goalId: goal.id, date: "2026-09-10", done: true, value: null });
    await expect(deleteGoal(goal.id)).rejects.toThrow("Goal has entries; archive it instead of deleting.");
    expect(await db.goals.get(goal.id)).toBeDefined();
  });
});
