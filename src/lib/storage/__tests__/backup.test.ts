import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { createCategory } from "../categories";
import { createGoal } from "../goals";
import { exportData } from "../backup";

describe("backup storage: exportData", () => {
  beforeEach(async () => {
    await db.categories.clear();
    await db.goals.clear();
    await db.entries.clear();
    await db.milestones.clear();
  });

  it("exports an empty dataset when nothing exists yet", async () => {
    const data = await exportData();
    expect(data.version).toBe(1);
    expect(data.categories).toEqual([]);
    expect(data.goals).toEqual([]);
    expect(data.entries).toEqual([]);
    expect(data.milestones).toEqual([]);
    expect(data.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("exports categories, goals, entries, and milestones", async () => {
    const category = await createCategory({ name: "Gesundheit", color: "#22c55e", icon: "heart" });
    const goal = await createGoal({ title: "Wasser trinken", type: "boolean", periodicity: "daily", categoryId: category.id });
    await db.entries.add({ id: "e1", goalId: goal.id, date: "2026-09-10", done: true, value: null });
    await db.milestones.add({ id: "m1", goalId: goal.id, type: "streak", threshold: 7, achievedAt: "2026-09-10" });

    const data = await exportData();
    expect(data.categories).toEqual([category]);
    expect(data.goals).toEqual([goal]);
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].id).toBe("e1");
    expect(data.milestones).toHaveLength(1);
    expect(data.milestones[0].id).toBe("m1");
  });
});
