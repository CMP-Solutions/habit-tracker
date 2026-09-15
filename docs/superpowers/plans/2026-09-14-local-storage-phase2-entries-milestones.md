# Local Storage Migration — Phase 2: Entries + Milestones + Derived Goal Fields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the entry-recording, streak/milestone-awarding, and derived-goal-field logic from `src/app/api/entries/route.ts`, `src/app/api/milestones/route.ts`, `src/app/api/goals/route.ts` (GET), and `src/app/api/goals/[id]/history/route.ts` to the Dexie storage layer, reusing `src/lib/domain/*` exactly as-is.

**Architecture:** New `src/lib/storage/entries.ts` and `src/lib/storage/milestones.ts`, plus two new functions added to the existing `src/lib/storage/goals.ts`. Every function converts a record's `"YYYY-MM-DD"` string dates to `Date` objects via `parseUtcDateString` (from `@/lib/domain/window`) only at the boundary where a domain function (`densifyDailyResults`, `groupIntoWeeks`, etc.) requires `Date` — the stored `EntryRecord`/`GoalRecord` shapes and this module's own public function signatures stay string-based throughout, matching Phase 1.

**Tech Stack:** Same as Phase 1 (Dexie, `fake-indexeddb` for tests). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-14-local-storage-migration.md`

## Global Constraints

- All calendar-day dates are `"YYYY-MM-DD"` strings in every `storage/*` function's public signature; convert to `Date` internally only when a domain function demands it (Global Constraint carried over from Phase 1, spec §3).
- Do not modify `src/lib/domain/*` — every function in this phase is a straight port of existing Prisma-backed route logic onto Dexie, reusing the domain layer unchanged (spec §4).
- Do not modify `src/app/api/**` or any existing test — the old backend keeps working side by side (spec §5).
- Avoid querying Dexie by a boolean-valued index (e.g. `goals.archived`) — fetch with `.toArray()`/`.where("goalId")` etc. and filter booleans in JS, exactly as Phase 1's `listGoals` already does. This sidesteps a real cross-browser IndexedDB boolean-key inconsistency risk instead of hitting it later.

---

### Task 1: Entries repository — `recordEntry`

**Files:**
- Create: `src/lib/storage/entries.ts`
- Test: `src/lib/storage/__tests__/entries.test.ts`

**Interfaces:**
- Consumes: `db`, `EntryRecord`, `MilestoneRecord` from `./db`; `generateId` from `./id`; `parseUtcDateString`, `utcToday` from `@/lib/domain/window`; `DailyResult` from `@/lib/domain/streak`; `densifyDailyResults` from `@/lib/domain/densify`; `groupIntoWeeks`, `evaluateWeek` from `@/lib/domain/weeklyGoal`; `groupIntoCalendarPeriods`, `evaluatePeriod`, `PeriodUnit` from `@/lib/domain/periodCount`; `determineNewMilestones`, `MilestoneAward` from `@/lib/domain/milestones`; `createGoal` from `./goals` (tests only).
- Produces: `recordEntry(input: { goalId: string; date: string; done?: boolean; value?: number | null }): Promise<{ entry: EntryRecord; newMilestones: MilestoneAward[] }>`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/storage/__tests__/entries.test.ts`:

```ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { createGoal } from "../goals";
import { recordEntry } from "../entries";

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
    expect(milestones).toHaveLength(1);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/storage/__tests__/entries.test.ts`
Expected: FAIL with a module-not-found error for `../entries`.

- [ ] **Step 3: Write `src/lib/storage/entries.ts`**

```ts
import { db, type EntryRecord, type MilestoneRecord } from "./db";
import { generateId } from "./id";
import { parseUtcDateString, utcToday } from "@/lib/domain/window";
import { DailyResult } from "@/lib/domain/streak";
import { densifyDailyResults } from "@/lib/domain/densify";
import { groupIntoWeeks, evaluateWeek } from "@/lib/domain/weeklyGoal";
import { groupIntoCalendarPeriods, evaluatePeriod, PeriodUnit } from "@/lib/domain/periodCount";
import { determineNewMilestones, MilestoneAward } from "@/lib/domain/milestones";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function recordEntry(input: {
  goalId: string;
  date: string;
  done?: boolean;
  value?: number | null;
}): Promise<{ entry: EntryRecord; newMilestones: MilestoneAward[] }> {
  if (typeof input.goalId !== "string" || input.goalId.length === 0) {
    throw new Error("goalId is required.");
  }
  if (typeof input.date !== "string" || !DATE_PATTERN.test(input.date)) {
    throw new Error("date must be a calendar date in YYYY-MM-DD format.");
  }
  const dayDate = parseUtcDateString(input.date);
  if (!dayDate) {
    throw new Error("date is not a valid calendar date.");
  }

  const goal = await db.goals.get(input.goalId);
  if (!goal) throw new Error("Not found");

  const existing = await db.entries.where("[goalId+date]").equals([input.goalId, input.date]).first();
  const entry: EntryRecord = {
    id: existing?.id ?? generateId(),
    goalId: input.goalId,
    date: input.date,
    done: !!input.done,
    value: input.value ?? null,
  };
  await db.entries.put(entry);

  const allEntries = await db.entries.where("goalId").equals(input.goalId).sortBy("date");
  const recorded = allEntries.map((e) => ({
    date: parseUtcDateString(e.date) as Date,
    success: goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity),
  }));

  // Streaks are calendar based: every day between the first recorded day and
  // the most recently recorded one must be present, so that days without an
  // entry break the streak instead of silently disappearing.
  const goalCreatedAt = parseUtcDateString(goal.createdAt) as Date;
  const firstRecorded = recorded[0]?.date ?? dayDate;
  const from = goalCreatedAt < firstRecorded ? goalCreatedAt : firstRecorded;
  const lastRecorded = recorded[recorded.length - 1]?.date ?? dayDate;
  const dailyResults: DailyResult[] = densifyDailyResults(recorded, from, lastRecorded);

  let evaluationResults: DailyResult[] = dailyResults;
  if (goal.periodicity === "weekly" && goal.weeklyThreshold != null) {
    const weeks = groupIntoWeeks(dailyResults.map((d) => ({ date: d.date, success: d.success })));
    evaluationResults = weeks.map((week) => ({
      date: week[0].date,
      success: evaluateWeek(week, goal.weeklyThreshold as number),
    }));
  } else if (
    goal.periodicity === "count_per_period" &&
    (goal.periodUnit === "week" || goal.periodUnit === "month") &&
    goal.periodTarget != null
  ) {
    const periods = groupIntoCalendarPeriods(
      dailyResults.map((d) => ({ date: d.date, success: d.success })),
      goal.periodUnit as PeriodUnit
    );
    evaluationResults = periods.map((period) => ({
      date: period[0].date,
      success: evaluatePeriod(period, goal.periodTarget as number),
    }));
  }

  const existingMilestones = await db.milestones.where("goalId").equals(input.goalId).toArray();
  const alreadyAwarded: MilestoneAward[] = existingMilestones.map((m) => ({ type: m.type, threshold: m.threshold }));

  const newMilestones = determineNewMilestones(evaluationResults, alreadyAwarded);
  if (newMilestones.length > 0) {
    const todayStr = utcToday().toISOString().slice(0, 10);
    const records: MilestoneRecord[] = newMilestones.map((m) => ({
      id: generateId(),
      goalId: input.goalId,
      type: m.type,
      threshold: m.threshold,
      achievedAt: todayStr,
    }));
    await db.milestones.bulkAdd(records);
  }

  return { entry, newMilestones };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/storage/__tests__/entries.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/entries.ts src/lib/storage/__tests__/entries.test.ts
git commit -m "feat: add local entries repository with streak/milestone awarding"
```

---

### Task 2: Milestones repository — `getMilestones`

**Files:**
- Create: `src/lib/storage/milestones.ts`
- Test: `src/lib/storage/__tests__/milestones.test.ts`

**Interfaces:**
- Consumes: `db`, `GoalRecord` from `./db`; `parseUtcDateString`, `utcToday` from `@/lib/domain/window`; `densifyDailyResults` from `@/lib/domain/densify`; `calculateCurrentStreak`, `calculateTotalSuccessCount` from `@/lib/domain/streak`; `determineUpcomingProgress`, `MilestoneAward` from `@/lib/domain/milestones`; `createGoal` from `./goals` and `recordEntry` from `./entries` (tests only).
- Produces: `getMilestones(): Promise<{ achieved: AchievedMilestoneView[]; upcoming: UpcomingMilestoneView[] }>`, plus the exported `AchievedMilestoneView`/`UpcomingMilestoneView` types.

- [ ] **Step 1: Write the failing test**

Create `src/lib/storage/__tests__/milestones.test.ts`:

```ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { createGoal } from "../goals";
import { recordEntry } from "../entries";
import { getMilestones } from "../milestones";

describe("milestones storage: getMilestones", () => {
  beforeEach(async () => {
    await db.goals.clear();
    await db.entries.clear();
    await db.milestones.clear();
  });

  it("reports upcoming progress toward the next unearned streak threshold", async () => {
    const goal = await createGoal({ title: "Laufen", type: "boolean", periodicity: "daily" });
    for (const date of ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10"]) {
      await recordEntry({ goalId: goal.id, date, done: true });
    }

    const { upcoming } = await getMilestones();
    expect(upcoming).toContainEqual({
      goalId: goal.id,
      goalTitle: "Laufen",
      goalIcon: null,
      type: "streak",
      threshold: 7,
      current: 4,
    });
  });

  it("omits a goal with no entries yet", async () => {
    await createGoal({ title: "Neu", type: "boolean", periodicity: "daily" });
    const { upcoming } = await getMilestones();
    expect(upcoming).toEqual([]);
  });

  it("excludes archived goals from upcoming progress", async () => {
    const goal = await createGoal({ title: "Alt", type: "boolean", periodicity: "daily" });
    await recordEntry({ goalId: goal.id, date: "2026-09-10", done: true });
    await db.goals.update(goal.id, { archived: true });

    const { upcoming } = await getMilestones();
    expect(upcoming.some((u) => u.goalId === goal.id)).toBe(false);
  });

  it("skips to the 30-day threshold once the 7-day streak milestone is already awarded", async () => {
    const goal = await createGoal({ title: "Meditieren", type: "boolean", periodicity: "daily" });
    for (const date of ["2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10"]) {
      await recordEntry({ goalId: goal.id, date, done: true });
    }

    const { upcoming } = await getMilestones();
    const streakProgress = upcoming.find((u) => u.goalId === goal.id && u.type === "streak");
    expect(streakProgress?.threshold).toBe(30);
  });

  it("still returns the achieved list", async () => {
    const goal = await createGoal({ title: "Sport", type: "boolean", periodicity: "daily" });
    for (const date of ["2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10"]) {
      await recordEntry({ goalId: goal.id, date, done: true });
    }

    const { achieved } = await getMilestones();
    expect(achieved).toHaveLength(1);
    expect(achieved[0].goal.title).toBe("Sport");
    expect(achieved[0].type).toBe("streak");
    expect(achieved[0].threshold).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/storage/__tests__/milestones.test.ts`
Expected: FAIL with a module-not-found error for `../milestones`.

- [ ] **Step 3: Write `src/lib/storage/milestones.ts`**

```ts
import { db } from "./db";
import { parseUtcDateString, utcToday } from "@/lib/domain/window";
import { densifyDailyResults } from "@/lib/domain/densify";
import { calculateCurrentStreak, calculateTotalSuccessCount } from "@/lib/domain/streak";
import { determineUpcomingProgress, MilestoneAward } from "@/lib/domain/milestones";

export interface AchievedMilestoneView {
  id: string;
  type: MilestoneAward["type"];
  threshold: number;
  achievedAt: string;
  goal: { title: string; icon: string | null };
}

export interface UpcomingMilestoneView {
  goalId: string;
  goalTitle: string;
  goalIcon: string | null;
  type: MilestoneAward["type"];
  threshold: number;
  current: number;
}

export async function getMilestones(): Promise<{
  achieved: AchievedMilestoneView[];
  upcoming: UpcomingMilestoneView[];
}> {
  const milestoneRecords = await db.milestones.toArray();
  milestoneRecords.sort((a, b) => (a.achievedAt < b.achievedAt ? 1 : a.achievedAt > b.achievedAt ? -1 : 0));

  const allGoals = await db.goals.toArray();
  const goalById = new Map(allGoals.map((g) => [g.id, g]));

  const achieved: AchievedMilestoneView[] = milestoneRecords
    .filter((m) => goalById.has(m.goalId))
    .map((m) => {
      const goal = goalById.get(m.goalId)!;
      return {
        id: m.id,
        type: m.type,
        threshold: m.threshold,
        achievedAt: m.achievedAt,
        goal: { title: goal.title, icon: goal.icon },
      };
    });

  const awardedByGoal = new Map<string, MilestoneAward[]>();
  for (const m of milestoneRecords) {
    const list = awardedByGoal.get(m.goalId) ?? [];
    list.push({ type: m.type, threshold: m.threshold });
    awardedByGoal.set(m.goalId, list);
  }

  // Upcoming progress only for goals still being tracked — an archived goal
  // won't accrue further streak/count progress, so showing "how close" to a
  // habit that's no longer active would be misleading.
  const activeGoals = allGoals.filter((g) => !g.archived);
  const today = utcToday();
  const upcoming: UpcomingMilestoneView[] = [];

  for (const goal of activeGoals) {
    const entries = await db.entries.where("goalId").equals(goal.id).sortBy("date");
    if (entries.length === 0) continue;

    const recorded = entries.map((e) => ({
      date: parseUtcDateString(e.date) as Date,
      success: goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity),
    }));
    const createdDay = parseUtcDateString(goal.createdAt) as Date;
    const earliestEntryDate = recorded[0].date;
    const from = earliestEntryDate < createdDay ? earliestEntryDate : createdDay;
    const results = densifyDailyResults(recorded, from, today);

    // Same "don't zero out a real streak for an undecided today" rule used
    // everywhere else streak is computed.
    const todayStr = today.toISOString().slice(0, 10);
    const hasTodayEntry = entries.some((e) => e.date === todayStr);
    const streakResults = hasTodayEntry ? results : results.slice(0, -1);

    const currentStreak = calculateCurrentStreak(streakResults);
    const totalCount = calculateTotalSuccessCount(results);
    const awarded = awardedByGoal.get(goal.id) ?? [];

    for (const progress of determineUpcomingProgress(currentStreak, totalCount, awarded)) {
      upcoming.push({ goalId: goal.id, goalTitle: goal.title, goalIcon: goal.icon, ...progress });
    }
  }

  // Closest to completion first, so the list reads as "what's coming up
  // next" rather than an arbitrary per-goal grouping.
  upcoming.sort((a, b) => b.current / b.threshold - a.current / a.threshold);

  return { achieved, upcoming };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/storage/__tests__/milestones.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/milestones.ts src/lib/storage/__tests__/milestones.test.ts
git commit -m "feat: add local milestones repository (achieved + upcoming)"
```

---

### Task 3: Extend goals repository — `listGoalsWithProgress`

**Files:**
- Modify: `src/lib/storage/goals.ts`
- Modify: `src/lib/storage/__tests__/goals.test.ts`

**Interfaces:**
- Consumes: everything already in `goals.ts`; `parseUtcDateString`, `utcToday`, `utcMidnightDaysAgo` from `@/lib/domain/window`; `periodBounds`, `PeriodUnit` from `@/lib/domain/periodCount`; `densifyDailyResults` from `@/lib/domain/densify`; `calculateCurrentStreak` from `@/lib/domain/streak`.
- Produces: `listGoalsWithProgress(): Promise<GoalWithProgress[]>` and the exported `GoalWithProgress` type — `GoalRecord & { todayEntry: { done: boolean; value: number | null } | null; periodProgress: { current: number; target: number } | null; currentStreak: number }`.

This mirrors `GET /api/goals` exactly (today's entry, period progress for the current calendar period, and the backfill-safe current streak fixed earlier in this project's history).

- [ ] **Step 1: Write the failing test**

Add this import and these `it` blocks to `src/lib/storage/__tests__/goals.test.ts` (add `recordEntry` import from `../entries` and `listGoalsWithProgress` from `../goals`):

```ts
import { recordEntry } from "../entries";
```

```ts
  it("includes today's entry so the dashboard can seed its checked state", async () => {
    const goal = await createGoal({ title: "Lesen", type: "boolean", periodicity: "daily" });
    const today = new Date().toISOString().slice(0, 10);
    await recordEntry({ goalId: goal.id, date: today, done: true });

    const goals = await listGoalsWithProgress();
    const found = goals.find((g) => g.id === goal.id);
    expect(found?.todayEntry).toEqual({ done: true, value: null });
  });

  it("reports a null todayEntry when there is no check-in today", async () => {
    await createGoal({ title: "Laufen", type: "boolean", periodicity: "daily" });
    const goals = await listGoalsWithProgress();
    expect(goals[0].todayEntry).toBeNull();
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/storage/__tests__/goals.test.ts`
Expected: FAIL with `listGoalsWithProgress is not a function`.

- [ ] **Step 3: Add `listGoalsWithProgress` to `src/lib/storage/goals.ts`**

Add these imports to the top of the file (alongside the existing `./db` and `./id` imports):

```ts
import { parseUtcDateString, utcToday, utcMidnightDaysAgo } from "@/lib/domain/window";
import { periodBounds, PeriodUnit } from "@/lib/domain/periodCount";
import { densifyDailyResults } from "@/lib/domain/densify";
import { calculateCurrentStreak } from "@/lib/domain/streak";
```

Append this to the end of the file:

```ts
export interface GoalWithProgress extends GoalRecord {
  todayEntry: { done: boolean; value: number | null } | null;
  periodProgress: { current: number; target: number } | null;
  currentStreak: number;
}

export async function listGoalsWithProgress(): Promise<GoalWithProgress[]> {
  const today = utcToday();
  const todayStr = today.toISOString().slice(0, 10);

  // A goal past its end date drops off "Heute"/"Woche" but stays visible in
  // stats/milestones elsewhere — filtered here, not by mutating state.
  const allGoals = await db.goals.orderBy("createdAt").toArray();
  const goals = allGoals.filter((g) => {
    if (g.archived) return false;
    if (g.endDate && g.endDate < todayStr) return false;
    return true;
  });

  const goalIds = goals.map((g) => g.id);
  const todaysEntries = await db.entries.where("goalId").anyOf(goalIds).and((e) => e.date === todayStr).toArray();
  const entryByGoal = new Map(todaysEntries.map((e) => [e.goalId, e]));

  const periodProgressByGoal = new Map<string, { current: number; target: number }>();
  for (const goal of goals) {
    if (goal.periodicity !== "count_per_period" || !goal.periodUnit || goal.periodTarget == null) continue;
    const { start, end } = periodBounds(today, goal.periodUnit as PeriodUnit);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const entries = await db.entries
      .where("goalId")
      .equals(goal.id)
      .and((e) => e.date >= startStr && e.date <= endStr)
      .toArray();
    const current = entries.filter((e) =>
      goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity)
    ).length;
    periodProgressByGoal.set(goal.id, { current, target: goal.periodTarget });
  }

  // Current streak per goal, computed through yesterday then extended with
  // today's already-fetched entry — an unchecked "today" must not zero out a
  // real streak before the user has had a chance to check in.
  const since = utcMidnightDaysAgo(60);
  const yesterday = utcMidnightDaysAgo(1);
  const sinceStr = since.toISOString().slice(0, 10);
  const streakByGoal = new Map<string, number>();

  for (const goal of goals) {
    const entries = await db.entries
      .where("goalId")
      .equals(goal.id)
      .and((e) => e.date >= sinceStr && e.date < todayStr)
      .sortBy("date");
    const createdDay = parseUtcDateString(goal.createdAt) as Date;
    let from = createdDay > since ? createdDay : since;
    // A backfilled entry dated before the goal's own createdAt must still
    // count toward the streak — goals never reject backfilled history.
    const earliestEntryDate = entries[0] ? (parseUtcDateString(entries[0].date) as Date) : undefined;
    if (earliestEntryDate && earliestEntryDate < from) from = earliestEntryDate;

    const results = from > yesterday
      ? []
      : densifyDailyResults(
          entries.map((e) => ({
            date: parseUtcDateString(e.date) as Date,
            success: goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity),
          })),
          from,
          yesterday
        );
    let streak = calculateCurrentStreak(results);
    const todayEntry = entryByGoal.get(goal.id);
    const todaySuccess = todayEntry
      ? goal.type === "boolean"
        ? todayEntry.done
        : (todayEntry.value ?? 0) >= (goal.targetValue ?? Infinity)
      : false;
    if (todaySuccess) streak++;
    streakByGoal.set(goal.id, streak);
  }

  return goals.map((goal) => {
    const entry = entryByGoal.get(goal.id);
    return {
      ...goal,
      todayEntry: entry ? { done: entry.done, value: entry.value } : null,
      periodProgress: periodProgressByGoal.get(goal.id) ?? null,
      currentStreak: streakByGoal.get(goal.id) ?? 0,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/storage/__tests__/goals.test.ts`
Expected: PASS (21 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/goals.ts src/lib/storage/__tests__/goals.test.ts
git commit -m "feat: add listGoalsWithProgress (today entry, period progress, streak)"
```

---

### Task 4: Extend goals repository — `getGoalHistory`

**Files:**
- Modify: `src/lib/storage/goals.ts`
- Modify: `src/lib/storage/__tests__/goals.test.ts`

**Interfaces:**
- Consumes: everything already in `goals.ts` plus `HISTORY_WINDOW_DAYS` from `@/lib/domain/window`; `calculateLongestStreak`, `calculateTotalSuccessCount` from `@/lib/domain/streak`.
- Produces: `getGoalHistory(id: string): Promise<GoalHistory>` and the exported `GoalHistory` type — mirrors `GET /api/goals/[id]/history`'s response shape (`goal`, `results`, `milestones`, `entryCount`, `currentStreak`, `longestStreak`, `totalSuccessCount`). Throws `Error("Not found")` for an unknown id.

- [ ] **Step 1: Write the failing test**

Add this import to `src/lib/storage/__tests__/goals.test.ts` (alongside the existing imports): `getGoalHistory` from `../goals`. Then add these `it` blocks:

```ts
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
```

`recordEntry` must already be imported in this test file from Task 3's changes; `db` is already imported.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/storage/__tests__/goals.test.ts`
Expected: FAIL with `getGoalHistory is not a function`.

- [ ] **Step 3: Add `getGoalHistory` to `src/lib/storage/goals.ts`**

Add this import to the top of the file (alongside the others):

```ts
import { HISTORY_WINDOW_DAYS } from "@/lib/domain/window";
import { calculateLongestStreak, calculateTotalSuccessCount } from "@/lib/domain/streak";
```

Append this to the end of the file:

```ts
export interface GoalHistory {
  goal: GoalRecord;
  results: { date: string; success: boolean }[];
  milestones: { id: string; type: "streak" | "total_count"; threshold: number; achievedAt: string }[];
  entryCount: number;
  currentStreak: number;
  longestStreak: number;
  totalSuccessCount: number;
}

export async function getGoalHistory(id: string): Promise<GoalHistory> {
  const goal = await db.goals.get(id);
  if (!goal) throw new Error("Not found");

  // The window matches the Heatmap grid exactly (HISTORY_WINDOW_DAYS days
  // back through today, inclusive), so no fetched entry is dropped and no
  // cell is rendered for a day that was never fetched.
  const since = utcMidnightDaysAgo(HISTORY_WINDOW_DAYS);
  const today = utcToday();
  const sinceStr = since.toISOString().slice(0, 10);

  const entries = await db.entries.where("goalId").equals(id).and((e) => e.date >= sinceStr).sortBy("date");

  const createdDay = parseUtcDateString(goal.createdAt) as Date;
  let from = createdDay > since ? createdDay : since;
  // A backfilled entry dated before the goal's own createdAt must still
  // count — goals never reject backfilled history.
  const earliestEntryDate = entries[0] ? (parseUtcDateString(entries[0].date) as Date) : undefined;
  if (earliestEntryDate && earliestEntryDate < from) from = earliestEntryDate;

  const results = from > today
    ? []
    : densifyDailyResults(
        entries.map((e) => ({
          date: parseUtcDateString(e.date) as Date,
          success: goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity),
        })),
        from,
        today
      );

  const milestones = await db.milestones.where("goalId").equals(id).sortBy("achievedAt");

  // `results` truthfully shows an unchecked today as a gap (correct for the
  // heatmap/trend), but that would zero out a real streak before the user
  // has had a chance to check in today — drop today from the streak
  // calculation unless it already has a recorded entry.
  const todayStr = today.toISOString().slice(0, 10);
  const hasTodayEntry = entries.some((e) => e.date === todayStr);
  const streakResults = hasTodayEntry ? results : results.slice(0, -1);

  return {
    goal,
    results,
    milestones,
    entryCount: entries.length,
    currentStreak: calculateCurrentStreak(streakResults),
    longestStreak: calculateLongestStreak(results),
    totalSuccessCount: calculateTotalSuccessCount(results),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/storage/__tests__/goals.test.ts`
Expected: PASS (23 tests)

- [ ] **Step 5: Run the full test suite, typecheck, and lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: every test passes (Phase 1's 22 storage tests + this phase's new/extended ones + all 99 pre-existing tests), no type errors, no lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/goals.ts src/lib/storage/__tests__/goals.test.ts
git commit -m "feat: add getGoalHistory (heatmap/trend data, streak stats, milestones)"
```

---

## Self-Review Notes

- **Spec coverage:** Spec §5 Phase 2 scope ("Entries + Milestones + abgeleitete Goal-Felder — Streak-Berechnung, Periodenauswertung, Meilenstein-Vergabe; erweitert listGoals um todayEntry/periodProgress/currentStreak") → Tasks 1–4 cover exactly this: entry recording with milestone awarding (Task 1), achieved+upcoming milestones (Task 2), the dashboard's derived goal fields (Task 3), and the goal-detail history endpoint's equivalent (Task 4, not explicitly named in the spec's one-line Phase 2 summary but required for Phase 6's UI wiring to have anywhere to read heatmap/trend/longest-streak data from — flagging this explicitly rather than silently expanding scope).
- **Placeholder scan:** none — every step has runnable code and exact assertions.
- **Type consistency:** `EntryRecord`/`MilestoneRecord` (Phase 1's `db.ts`) are used unchanged. `MilestoneAward` is imported from the existing `@/lib/domain/milestones` rather than redefined. `GoalWithProgress` and `GoalHistory` (Task 3, Task 4) are new exported types Phase 6 (UI wiring) will import by these exact names.

## What Phase 3 needs from this phase (for the next plan document)

- `recordEntry` (Task 1) is the only entry point later phases use to write entries — Phase 3's Stats/Week repositories only need read access to `db.entries`/`db.goals`, no new write paths.
- `listGoalsWithProgress` (Task 3) and `getGoalHistory` (Task 4) establish the pattern (string-date boundary conversion via `parseUtcDateString`) that Phase 3's `stats.ts`/`week.ts` should follow for their own date-range queries.
