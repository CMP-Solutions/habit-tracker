import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { createGoal } from "../goals";
import { recordEntry, recordSkip } from "../entries";
import { getMilestones } from "../milestones";

const utcToday = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const daysAgo = (n: number) => {
  const d = utcToday();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

describe("milestones storage: getMilestones", () => {
  beforeEach(async () => {
    await db.goals.clear();
    await db.entries.clear();
    await db.milestones.clear();
  });

  it("reports upcoming progress toward the next unearned streak threshold", async () => {
    const goal = await createGoal({ title: "Laufen", type: "boolean", periodicity: "daily" });
    for (const n of [3, 2, 1, 0]) {
      await recordEntry({ goalId: goal.id, date: daysAgo(n), done: true });
    }

    const { upcoming } = await getMilestones();
    expect(upcoming).toContainEqual({
      goalId: goal.id,
      goalTitle: "Laufen",
      goalIcon: null,
      type: "streak",
      threshold: 7,
      current: 4,
      achievedThresholds: [3],
    });
  });

  it("omits a goal with no entries yet", async () => {
    await createGoal({ title: "Neu", type: "boolean", periodicity: "daily" });
    const { upcoming } = await getMilestones();
    expect(upcoming).toEqual([]);
  });

  it("excludes archived goals from upcoming progress", async () => {
    const goal = await createGoal({ title: "Alt", type: "boolean", periodicity: "daily" });
    await recordEntry({ goalId: goal.id, date: daysAgo(0), done: true });
    await db.goals.update(goal.id, { archived: true });

    const { upcoming } = await getMilestones();
    expect(upcoming.some((u) => u.goalId === goal.id)).toBe(false);
  });

  it("skips to the 30-day threshold once the 7-day streak milestone is already awarded", async () => {
    const goal = await createGoal({ title: "Meditieren", type: "boolean", periodicity: "daily" });
    for (const n of [6, 5, 4, 3, 2, 1, 0]) {
      await recordEntry({ goalId: goal.id, date: daysAgo(n), done: true });
    }

    const { upcoming } = await getMilestones();
    const streakProgress = upcoming.find((u) => u.goalId === goal.id && u.type === "streak");
    expect(streakProgress?.threshold).toBe(30);
  });

  it("still returns the achieved list, including every tier reached", async () => {
    const goal = await createGoal({ title: "Sport", type: "boolean", periodicity: "daily" });
    for (const n of [6, 5, 4, 3, 2, 1, 0]) {
      await recordEntry({ goalId: goal.id, date: daysAgo(n), done: true });
    }

    const { achieved } = await getMilestones();
    expect(achieved).toHaveLength(2);
    expect(achieved.every((m) => m.goal.title === "Sport" && m.type === "streak")).toBe(true);
    expect(achieved.map((m) => m.threshold).sort((a, b) => a - b)).toEqual([3, 7]);
  });

  it("does not let a skipped today zero out upcoming streak progress", async () => {
    const goal = await createGoal({ title: "Laufen", type: "boolean", periodicity: "daily" });
    for (const n of [3, 2, 1]) {
      await recordEntry({ goalId: goal.id, date: daysAgo(n), done: true });
    }
    await recordSkip({ goalId: goal.id, date: daysAgo(0) });

    const { upcoming } = await getMilestones();
    const progress = upcoming.find((u) => u.goalId === goal.id && u.type === "streak");
    expect(progress?.current).toBe(3);
  });
});
