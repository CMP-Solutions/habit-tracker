import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { createGoal } from "../goals";
import { createCategory } from "../categories";
import { recordEntry } from "../entries";
import { getWeek } from "../week";
import { utcToday } from "@/lib/domain/window";
import { periodBounds } from "@/lib/domain/periodCount";

describe("week storage: getWeek", () => {
  beforeEach(async () => {
    await db.goals.clear();
    await db.entries.clear();
    await db.categories.clear();
  });

  it("returns the 7 days of the current week starting Monday", async () => {
    const { days } = await getWeek();
    expect(days).toHaveLength(7);
    const monday = periodBounds(utcToday(), "week").start.toISOString().slice(0, 10);
    expect(days[0]).toBe(monday);
  });

  it("includes an entry keyed by day for a goal with data, and null for days without one", async () => {
    const goal = await createGoal({ title: "Wasser trinken", type: "boolean", periodicity: "daily" });
    const { days } = await getWeek();
    await recordEntry({ goalId: goal.id, date: days[0], done: true, value: null });

    const { goals } = await getWeek();
    const found = goals.find((g) => g.id === goal.id);
    expect(found?.entries[days[0]]).toEqual({ done: true, value: null });
    expect(found?.entries[days[1]]).toBeNull();
  });

  it("excludes a goal past its endDate", async () => {
    const { days } = await getWeek();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await createGoal({ title: "Abgelaufen", type: "boolean", periodicity: "daily", endDate: yesterday });

    const { goals } = await getWeek();
    expect(goals.some((g) => g.title === "Abgelaufen")).toBe(false);
    // Sanity: days is still the full week even though this goal is filtered out.
    expect(days).toHaveLength(7);
  });

  it("excludes an archived goal", async () => {
    const goal = await createGoal({ title: "Pausiert", type: "boolean", periodicity: "daily" });
    await db.goals.update(goal.id, { archived: true });

    const { goals } = await getWeek();
    expect(goals.some((g) => g.id === goal.id)).toBe(false);
  });

  it("includes the goal's category as { name, color } when it has one", async () => {
    const category = await createCategory({ name: "Gesundheit", color: "#22c55e", icon: "heart" });
    const goal = await createGoal({
      title: "Wasser trinken",
      type: "boolean",
      periodicity: "daily",
      categoryId: category.id,
    });

    const { goals } = await getWeek();
    const found = goals.find((g) => g.id === goal.id);
    expect(found?.category).toEqual({ name: "Gesundheit", color: "#22c55e" });
  });

  it("returns null category for a goal without one", async () => {
    const goal = await createGoal({ title: "Ohne Kategorie", type: "boolean", periodicity: "daily" });
    const { goals } = await getWeek();
    expect(goals.find((g) => g.id === goal.id)?.category).toBeNull();
  });
});
