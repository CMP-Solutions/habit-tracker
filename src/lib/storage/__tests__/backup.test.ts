import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { createCategory } from "../categories";
import { createGoal } from "../goals";
import { exportData, importData } from "../backup";

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

describe("backup storage: importData", () => {
  beforeEach(async () => {
    await db.categories.clear();
    await db.goals.clear();
    await db.entries.clear();
    await db.milestones.clear();
  });

  it("round-trips: export then import reproduces the same data", async () => {
    const category = await createCategory({ name: "Gesundheit", color: "#22c55e", icon: "heart" });
    const goal = await createGoal({ title: "Wasser trinken", type: "boolean", periodicity: "daily", categoryId: category.id });
    await db.entries.add({ id: "e1", goalId: goal.id, date: "2026-09-10", done: true, value: null });
    await db.milestones.add({ id: "m1", goalId: goal.id, type: "streak", threshold: 7, achievedAt: "2026-09-10" });

    const exported = await exportData();
    await db.categories.clear();
    await db.goals.clear();
    await db.entries.clear();
    await db.milestones.clear();

    await importData(exported);

    expect(await db.categories.toArray()).toEqual([category]);
    expect(await db.goals.toArray()).toEqual([goal]);
    expect((await db.entries.toArray()).map((e) => e.id)).toEqual(["e1"]);
    expect((await db.milestones.toArray()).map((m) => m.id)).toEqual(["m1"]);
  });

  it("replaces existing local data rather than merging", async () => {
    await createCategory({ name: "Wird gelöscht", color: "#000", icon: "a" });
    const incoming = {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      categories: [{ id: "cat-imported", name: "Importiert", color: "#111", icon: "b" }],
      goals: [],
      entries: [],
      milestones: [],
    };

    await importData(incoming);

    const categories = await db.categories.toArray();
    expect(categories).toEqual([{ id: "cat-imported", name: "Importiert", color: "#111", icon: "b" }]);
  });

  it("rejects a file with the wrong version", async () => {
    await expect(
      importData({ version: 2, exportedAt: "x", categories: [], goals: [], entries: [], milestones: [] })
    ).rejects.toThrow("Invalid export file.");
  });

  it("rejects a file with a malformed goal record", async () => {
    await expect(
      importData({
        version: 1,
        exportedAt: "x",
        categories: [],
        goals: [{ id: "g1", title: "Ohne Typ" }], // missing type/periodicity/archived/createdAt
        entries: [],
        milestones: [],
      })
    ).rejects.toThrow("Invalid export file.");
  });

  it("rejects a file that isn't an object at all", async () => {
    await expect(importData("not json")).rejects.toThrow("Invalid export file.");
    await expect(importData(null)).rejects.toThrow("Invalid export file.");
  });

  it("does not modify existing data when the import is rejected", async () => {
    const category = await createCategory({ name: "Bleibt", color: "#000", icon: "a" });
    await expect(importData({ version: 2 })).rejects.toThrow();
    expect(await db.categories.toArray()).toEqual([category]);
  });
});
