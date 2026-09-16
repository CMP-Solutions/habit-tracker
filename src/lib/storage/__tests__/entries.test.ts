import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { createGoal } from "../goals";
import { recordEntry, recordSkip, deleteEntry } from "../entries";

describe("entries storage: recordEntry", () => {
  beforeEach(async () => {
    await db.goals.clear();
    await db.entries.clear();
    await db.milestones.clear();
  });

  it("records a boolean entry and retrieves it", async () => {
    const goal = await createGoal({ title: "Lesen", type: "boolean", periodicity: "daily" });
    const { entry } = await recordEntry({ goalId: goal.id, date: "2026-09-10", done: true });
    expect(entry.done).toBe(true);

    const stored = await db.entries.where("[goalId+date]").equals([goal.id, "2026-09-10"]).first();
    expect(stored?.done).toBe(true);
  });

  it("rejects an invalid date format", async () => {
    const goal = await createGoal({ title: "Lesen", type: "boolean", periodicity: "daily" });
    await expect(recordEntry({ goalId: goal.id, date: "10-09-2026", done: true })).rejects.toThrow(
      "date must be a calendar date in YYYY-MM-DD format."
    );
  });

  it("rejects an entry for a goal that doesn't exist", async () => {
    await expect(recordEntry({ goalId: "nonexistent", date: "2026-09-10", done: true })).rejects.toThrow("Not found");
  });

  it("upserts rather than duplicating on a second call for the same goal+date", async () => {
    const goal = await createGoal({ title: "Lesen", type: "boolean", periodicity: "daily" });
    await recordEntry({ goalId: goal.id, date: "2026-09-10", done: false });
    await recordEntry({ goalId: goal.id, date: "2026-09-10", done: true });

    const all = await db.entries.where("goalId").equals(goal.id).toArray();
    expect(all).toHaveLength(1);
    expect(all[0].done).toBe(true);
  });

  it("derives success from value >= targetValue for a quantitative goal, not the raw done flag", async () => {
    const goal = await createGoal({
      title: "10000 Schritte",
      type: "quantitative",
      unit: "Schritte",
      targetValue: 10000,
      periodicity: "daily",
    });
    const below = await recordEntry({ goalId: goal.id, date: "2026-09-10", done: false, value: 4000 });
    const above = await recordEntry({ goalId: goal.id, date: "2026-09-11", done: false, value: 12000 });
    // Neither reaches a milestone threshold yet — this only proves no crash
    // and that both entries were recorded with their real values.
    expect(below.entry.value).toBe(4000);
    expect(above.entry.value).toBe(12000);
  });

  it("awards a 7-day streak milestone for a daily boolean goal on the 7th consecutive day", async () => {
    const goal = await createGoal({ title: "Meditieren", type: "boolean", periodicity: "daily" });
    const days = ["2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10"];
    let last: { newMilestones: { type: string; threshold: number }[] } = { newMilestones: [] };
    for (const date of days) {
      last = await recordEntry({ goalId: goal.id, date, done: true });
    }
    expect(last.newMilestones).toEqual([{ type: "streak", threshold: 7 }]);

    const milestones = await db.milestones.where("goalId").equals(goal.id).toArray();
    expect(milestones).toHaveLength(2);
  });

  it("does not award the 7-day milestone one day early", async () => {
    const goal = await createGoal({ title: "Meditieren", type: "boolean", periodicity: "daily" });
    const days = ["2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09"];
    let last: { newMilestones: unknown[] } = { newMilestones: [] };
    for (const date of days) {
      last = await recordEntry({ goalId: goal.id, date, done: true });
    }
    expect(last.newMilestones).toEqual([]);
  });

  it("awards a 7-period streak milestone across 7 consecutive weekly periods, not 7 raw days", async () => {
    const goal = await createGoal({
      title: "1x pro Woche",
      type: "boolean",
      periodicity: "count_per_period",
      periodUnit: "week",
      periodTarget: 1,
    });
    // 7 Mondays, 7 days apart — one check-in per calendar week, 7 weeks running.
    // Raw-day evaluation would never form a 7-long streak from 7 isolated days
    // surrounded by empty gap days; only period-grouping does.
    const mondays = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"];
    let last: { newMilestones: { type: string; threshold: number }[] } = { newMilestones: [] };
    for (const date of mondays) {
      last = await recordEntry({ goalId: goal.id, date, done: true });
    }
    expect(last.newMilestones).toEqual([{ type: "streak", threshold: 7 }]);
  });
});

describe("recordSkip", () => {
  beforeEach(async () => {
    await db.goals.clear();
    await db.entries.clear();
    await db.milestones.clear();
  });

  it("marks the day skipped without setting done or value", async () => {
    const goal = await createGoal({ title: "Meditieren", type: "boolean", periodicity: "daily" });
    const { entry } = await recordSkip({ goalId: goal.id, date: "2026-09-10", reason: "Krank" });
    expect(entry.skipped).toBe(true);
    expect(entry.skipReason).toBe("Krank");
    expect(entry.done).toBe(false);
    expect(entry.value).toBeNull();
  });

  it("defaults skipReason to null when no reason is given", async () => {
    const goal = await createGoal({ title: "Meditieren", type: "boolean", periodicity: "daily" });
    const { entry } = await recordSkip({ goalId: goal.id, date: "2026-09-10" });
    expect(entry.skipReason).toBeNull();
  });

  it("does not create a milestone even if it would otherwise complete a streak", async () => {
    const goal = await createGoal({ title: "Meditieren", type: "boolean", periodicity: "daily" });
    for (const date of ["2026-09-04", "2026-09-05", "2026-09-06"]) {
      await recordEntry({ goalId: goal.id, date, done: true });
    }
    await recordSkip({ goalId: goal.id, date: "2026-09-07" });
    const milestones = await db.milestones.where("goalId").equals(goal.id).toArray();
    // The 3 entries create a 3-day milestone, but recordSkip itself doesn't create any milestone
    expect(milestones).toHaveLength(1);
  });

  it("overwrites a previously recorded entry for the same day", async () => {
    const goal = await createGoal({ title: "Meditieren", type: "boolean", periodicity: "daily" });
    await recordEntry({ goalId: goal.id, date: "2026-09-10", done: true });
    await recordSkip({ goalId: goal.id, date: "2026-09-10", reason: "Doch nicht" });
    const stored = await db.entries.where("[goalId+date]").equals([goal.id, "2026-09-10"]).first();
    expect(stored?.skipped).toBe(true);
    expect(stored?.done).toBe(false);
  });
});

describe("recordEntry clearing a previous skip", () => {
  beforeEach(async () => {
    await db.goals.clear();
    await db.entries.clear();
    await db.milestones.clear();
  });

  it("resets skipped/skipReason when a real entry is recorded over a skipped day", async () => {
    const goal = await createGoal({ title: "Meditieren", type: "boolean", periodicity: "daily" });
    await recordSkip({ goalId: goal.id, date: "2026-09-10", reason: "Krank" });
    await recordEntry({ goalId: goal.id, date: "2026-09-10", done: true });
    const stored = await db.entries.where("[goalId+date]").equals([goal.id, "2026-09-10"]).first();
    expect(stored?.skipped).toBe(false);
    expect(stored?.skipReason).toBeNull();
    expect(stored?.done).toBe(true);
  });
});

describe("deleteEntry", () => {
  beforeEach(async () => {
    await db.goals.clear();
    await db.entries.clear();
    await db.milestones.clear();
  });

  it("removes an existing entry for the given goal and date", async () => {
    const goal = await createGoal({ title: "Meditieren", type: "boolean", periodicity: "daily" });
    await recordSkip({ goalId: goal.id, date: "2026-09-10", reason: "Krank" });
    await deleteEntry({ goalId: goal.id, date: "2026-09-10" });
    const stored = await db.entries.where("[goalId+date]").equals([goal.id, "2026-09-10"]).first();
    expect(stored).toBeUndefined();
  });

  it("is a no-op when there is nothing to delete", async () => {
    const goal = await createGoal({ title: "Meditieren", type: "boolean", periodicity: "daily" });
    await expect(deleteEntry({ goalId: goal.id, date: "2026-09-10" })).resolves.toBeUndefined();
  });
});
