import { describe, it, expect } from "vitest";
import { countOpenGoals, reminderMessage, shouldNotify } from "../reminders";
import type { GoalWithProgress } from "../storage/goals";

function goal(overrides: Partial<GoalWithProgress> = {}): GoalWithProgress {
  return {
    id: "g1",
    categoryId: null,
    title: "Test",
    description: null,
    icon: null,
    endDate: null,
    type: "boolean",
    unit: null,
    targetValue: null,
    step: 1,
    periodicity: "daily",
    weeklyThreshold: null,
    periodUnit: null,
    periodTarget: null,
    archived: false,
    createdAt: "2026-09-01",
    reminderTime: null,
    motivation: null,
    category: null,
    todayEntry: null,
    periodProgress: null,
    currentStreak: 0,
    ...overrides,
  };
}

describe("countOpenGoals", () => {
  it("counts a boolean goal with no entry today as open", () => {
    expect(countOpenGoals([goal()])).toBe(1);
  });

  it("counts a boolean goal checked off today as not open", () => {
    expect(countOpenGoals([goal({ todayEntry: { done: true, value: null } })])).toBe(0);
  });

  it("counts a boolean goal explicitly marked not done today as open", () => {
    expect(countOpenGoals([goal({ todayEntry: { done: false, value: null } })])).toBe(1);
  });

  it("counts a quantitative goal below its target as open", () => {
    const g = goal({ type: "quantitative", targetValue: 10000, todayEntry: { done: false, value: 4000 } });
    expect(countOpenGoals([g])).toBe(1);
  });

  it("counts a quantitative goal at or above its target as not open", () => {
    const g = goal({ type: "quantitative", targetValue: 10000, todayEntry: { done: false, value: 10000 } });
    expect(countOpenGoals([g])).toBe(0);
  });

  it("sums across multiple goals", () => {
    const done = goal({ id: "g1", todayEntry: { done: true, value: null } });
    const open1 = goal({ id: "g2" });
    const open2 = goal({ id: "g3" });
    expect(countOpenGoals([done, open1, open2])).toBe(2);
  });
});

describe("reminderMessage", () => {
  it("uses singular phrasing for exactly one open goal", () => {
    expect(reminderMessage(1)).toBe("Du hast heute noch 1 offenes Ziel.");
  });

  it("uses plural phrasing for more than one open goal", () => {
    expect(reminderMessage(3)).toBe("Du hast heute noch 3 offene Ziele.");
  });
});

describe("shouldNotify", () => {
  const baseParams = {
    openCount: 2,
    enabled: true,
    permissionGranted: true,
    hour: 19,
    todayKey: "2026-09-15",
    lastNotifiedKey: null as string | null,
  };

  it("fires when enabled, permitted, past the reminder hour, with open goals, not yet notified today", () => {
    expect(shouldNotify(baseParams)).toBe(true);
  });

  it("does not fire when reminders are disabled", () => {
    expect(shouldNotify({ ...baseParams, enabled: false })).toBe(false);
  });

  it("does not fire without notification permission", () => {
    expect(shouldNotify({ ...baseParams, permissionGranted: false })).toBe(false);
  });

  it("does not fire when there are no open goals", () => {
    expect(shouldNotify({ ...baseParams, openCount: 0 })).toBe(false);
  });

  it("does not fire before the evening reminder hour", () => {
    expect(shouldNotify({ ...baseParams, hour: 10 })).toBe(false);
  });

  it("does not fire twice on the same day", () => {
    expect(shouldNotify({ ...baseParams, lastNotifiedKey: "2026-09-15" })).toBe(false);
  });

  it("fires again on a new day even if it already fired yesterday", () => {
    expect(shouldNotify({ ...baseParams, lastNotifiedKey: "2026-09-14" })).toBe(true);
  });
});
