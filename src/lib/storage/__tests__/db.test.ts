import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";

describe("db", () => {
  beforeEach(async () => {
    await db.categories.clear();
    await db.goals.clear();
    await db.entries.clear();
    await db.milestones.clear();
  });

  it("opens with the expected tables", async () => {
    await db.open();
    expect(db.tables.map((t) => t.name).sort()).toEqual(["categories", "entries", "goals", "milestones"]);
  });

  it("stores and retrieves a category record", async () => {
    await db.categories.add({ id: "cat-1", name: "Gesundheit", color: "#22c55e", icon: "heart" });
    const found = await db.categories.get("cat-1");
    expect(found).toEqual({ id: "cat-1", name: "Gesundheit", color: "#22c55e", icon: "heart" });
  });

  it("finds an entry by the [goalId+date] compound index", async () => {
    await db.entries.add({ id: "e1", goalId: "g1", date: "2026-09-10", done: true, value: null, skipped: false, skipReason: null });
    await db.entries.add({ id: "e2", goalId: "g1", date: "2026-09-11", done: false, value: null, skipped: false, skipReason: null });
    await db.entries.add({ id: "e3", goalId: "g2", date: "2026-09-10", done: true, value: null, skipped: false, skipReason: null });

    const found = await db.entries.where("[goalId+date]").equals(["g1", "2026-09-10"]).first();
    expect(found?.id).toBe("e1");
  });
});
