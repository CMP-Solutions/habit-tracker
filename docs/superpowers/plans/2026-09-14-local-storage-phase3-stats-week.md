# Local Storage Migration — Phase 3: Stats + Week — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `src/app/api/stats/route.ts` (Auswertung: heatmap/trend day-by-day success counts) and `src/app/api/week/route.ts` (Woche: the 7-day grid) to the Dexie storage layer.

**Architecture:** New `src/lib/storage/stats.ts` and `src/lib/storage/week.ts`. Unlike Phase 2, neither route calls into `src/lib/domain/*` at all (their aggregation logic is inline in the route file, not delegated to a domain module) — this phase is a pure read/aggregate port. Because every date involved is already a `"YYYY-MM-DD"` string in the new schema, both files can do all date-range comparisons via plain string comparison (ISO dates sort lexicographically) instead of constructing `Date` objects for every comparison the way the Prisma-backed routes had to — a genuine simplification, not just a mechanical port. `Date` objects are only used for calendar-day iteration (walking from one date string to the next), via `parseUtcDateString`.

**Tech Stack:** Same as Phases 1–2 (Dexie, `fake-indexeddb`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-14-local-storage-migration.md`

## Global Constraints

- All calendar-day dates are `"YYYY-MM-DD"` strings in every `storage/*` function's public signature (carried over from Phases 1–2, spec §3).
- Do not modify `src/lib/domain/*`, `src/app/api/**`, or any existing test — the old backend keeps working side by side (spec §5).
- Avoid querying Dexie by a boolean-valued index — fetch with `.toArray()`/`.where("goalId")` etc. and filter booleans in JS (carried over from Phase 2).
- Prefer string comparison over `Date` construction for date-range checks in this phase specifically, since neither `stats.ts` nor `week.ts` needs a domain function that requires `Date` objects — only use `parseUtcDateString` where a calendar-day walk (incrementing a date) is unavoidable.

---

### Task 1: Stats repository — `getStats`

**Files:**
- Create: `src/lib/storage/stats.ts`
- Test: `src/lib/storage/__tests__/stats.test.ts`

**Interfaces:**
- Consumes: `db` from `./db`; `utcToday`, `utcMidnightDaysAgo`, `parseUtcDateString` from `@/lib/domain/window`; `periodBounds` from `@/lib/domain/periodCount`; `createGoal` from `./goals` and `recordEntry` from `./entries` (tests only).
- Produces: `getStats(days?: number): Promise<{ daily: DayStat[]; week: { successCount: number; totalCount: number } }>` and the exported `DayStat` type (`{ date: string; successCount: number; totalCount: number }`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/storage/__tests__/stats.test.ts`:

```ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { createGoal } from "../goals";
import { recordEntry } from "../entries";
import { getStats } from "../stats";

const utcToday = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const daysAgo = (n: number) => {
  const d = utcToday();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

describe("stats storage: getStats", () => {
  beforeEach(async () => {
    await db.goals.clear();
    await db.entries.clear();
    await db.milestones.clear();
  });

  it("returns an empty daily list and zeroed week when there are no goals", async () => {
    const { daily, week } = await getStats(30);
    expect(daily.every((d) => d.totalCount === 0)).toBe(true);
    expect(week).toEqual({ successCount: 0, totalCount: 0 });
  });

  it("counts a backfilled entry dated before the goal's own createdAt", async () => {
    // Regression, ported from the Prisma-era fix: a goal created "today" but
    // backfilled via the Woche grid for yesterday must still count toward
    // that day's totals — backfilled history is never rejected.
    const goal = await createGoal({ title: "Wasser trinken", type: "boolean", periodicity: "daily" });
    await recordEntry({ goalId: goal.id, date: daysAgo(1), done: true });

    const { daily } = await getStats(30);
    const yesterday = daily.find((d) => d.date === daysAgo(1));
    expect(yesterday).toEqual({ date: daysAgo(1), successCount: 1, totalCount: 1 });
  });

  it("excludes a goal from a day before it existed when no entry was backfilled", async () => {
    await createGoal({ title: "Neu heute", type: "boolean", periodicity: "daily" });
    const { daily } = await getStats(30);
    const yesterday = daily.find((d) => d.date === daysAgo(1));
    expect(yesterday).toEqual({ date: daysAgo(1), successCount: 0, totalCount: 0 });
  });

  it("aggregates the current week's totals across days from Monday through today, independent of the days range", async () => {
    const goal = await createGoal({ title: "Sport", type: "boolean", periodicity: "daily" });
    await recordEntry({ goalId: goal.id, date: daysAgo(0), done: true });

    // A short 7-day range must not truncate the week aggregation to less
    // than the actual Monday-through-today span if that span is longer.
    const { week } = await getStats(7);
    expect(week.successCount).toBeGreaterThanOrEqual(1);
    expect(week.totalCount).toBeGreaterThanOrEqual(1);
  });

  it("derives success from value >= targetValue for a quantitative goal", async () => {
    const goal = await createGoal({
      title: "10000 Schritte",
      type: "quantitative",
      unit: "Schritte",
      targetValue: 10000,
      periodicity: "daily",
    });
    await recordEntry({ goalId: goal.id, date: daysAgo(0), done: false, value: 12000 });

    const { daily } = await getStats(30);
    const today = daily.find((d) => d.date === daysAgo(0));
    expect(today?.successCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/storage/__tests__/stats.test.ts`
Expected: FAIL with a module-not-found error for `../stats`.

- [ ] **Step 3: Write `src/lib/storage/stats.ts`**

```ts
import { db } from "./db";
import { utcToday, utcMidnightDaysAgo, parseUtcDateString } from "@/lib/domain/window";
import { periodBounds } from "@/lib/domain/periodCount";

export interface DayStat {
  date: string;
  successCount: number;
  totalCount: number;
}

export async function getStats(
  days: number = 30
): Promise<{ daily: DayStat[]; week: { successCount: number; totalCount: number } }> {
  const requestedDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 30;

  const today = utcToday();
  const todayStr = today.toISOString().slice(0, 10);
  // Inclusive window of `days` calendar days ending today. `days = 365`
  // therefore covers exactly the 365 cells the Heatmap renders.
  const since = utcMidnightDaysAgo(requestedDays - 1);
  const sinceStr = since.toISOString().slice(0, 10);

  // The current calendar week's summary always covers Monday through today
  // (not the full week — later days haven't happened yet and would only
  // dilute the percentage), independent of the selected range.
  const weekStartStr = periodBounds(today, "week").start.toISOString().slice(0, 10);
  const rangeStartStr = weekStartStr < sinceStr ? weekStartStr : sinceStr;

  const allGoals = await db.goals.toArray();
  const goals = allGoals.filter((g) => !g.archived);
  const goalIds = goals.map((g) => g.id);
  const entries =
    goalIds.length === 0
      ? []
      : await db.entries.where("goalId").anyOf(goalIds).and((e) => e.date >= rangeStartStr).toArray();

  const entryByGoalAndDay = new Map(entries.map((e) => [`${e.goalId}_${e.date}`, e]));

  function countsForDay(dateStr: string): { successCount: number; totalCount: number } {
    let successCount = 0;
    let totalCount = 0;
    for (const goal of goals) {
      if (goal.endDate && goal.endDate < dateStr) continue;
      const entry = entryByGoalAndDay.get(`${goal.id}_${dateStr}`);
      // A goal normally doesn't count toward a day before it existed — but a
      // backfilled entry for that day (e.g. logged via the Woche grid) proves
      // it should, since backfilled history is never rejected.
      if (goal.createdAt > dateStr && !entry) continue;
      totalCount++;
      const success = entry
        ? goal.type === "boolean"
          ? entry.done
          : (entry.value ?? 0) >= (goal.targetValue ?? Infinity)
        : false;
      if (success) successCount++;
    }
    return { successCount, totalCount };
  }

  const daily: DayStat[] = [];
  const cursor = parseUtcDateString(rangeStartStr) as Date;
  const end = parseUtcDateString(todayStr) as Date;
  while (cursor.getTime() <= end.getTime()) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const { successCount, totalCount } = countsForDay(dateStr);
    daily.push({ date: dateStr, successCount, totalCount });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const selectedRange = daily.filter((d) => d.date >= sinceStr);
  const week = daily
    .filter((d) => d.date >= weekStartStr)
    .reduce(
      (acc, d) => ({ successCount: acc.successCount + d.successCount, totalCount: acc.totalCount + d.totalCount }),
      { successCount: 0, totalCount: 0 }
    );

  return { daily: selectedRange, week };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/storage/__tests__/stats.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/stats.ts src/lib/storage/__tests__/stats.test.ts
git commit -m "feat: add local stats repository (Auswertung day totals and week summary)"
```

---

### Task 2: Week repository — `getWeek`

**Files:**
- Create: `src/lib/storage/week.ts`
- Test: `src/lib/storage/__tests__/week.test.ts`

**Interfaces:**
- Consumes: `db` from `./db`; `utcToday` from `@/lib/domain/window`; `periodBounds` from `@/lib/domain/periodCount`; `createGoal` from `./goals`, `createCategory` from `./categories`, and `recordEntry` from `./entries` (tests only).
- Produces: `getWeek(): Promise<WeekResult>` and the exported `WeekResult`/`WeekGoal`/`WeekEntry` types, matching `src/app/woche/page.tsx`'s existing `WeekResponse`/`WeekGoal`/`WeekEntry` interfaces exactly (Phase 6 will import these types unchanged when it rewires that page).

- [ ] **Step 1: Write the failing test**

Create `src/lib/storage/__tests__/week.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/storage/__tests__/week.test.ts`
Expected: FAIL with a module-not-found error for `../week`.

- [ ] **Step 3: Write `src/lib/storage/week.ts`**

```ts
import { db } from "./db";
import { utcToday } from "@/lib/domain/window";
import { periodBounds } from "@/lib/domain/periodCount";

export interface WeekEntry {
  done: boolean;
  value: number | null;
}

export interface WeekGoal {
  id: string;
  title: string;
  icon: string | null;
  type: "boolean" | "quantitative";
  unit: string | null;
  targetValue: number | null;
  step: number;
  category: { name: string; color: string } | null;
  entries: Record<string, WeekEntry | null>;
}

export interface WeekResult {
  days: string[];
  goals: WeekGoal[];
}

export async function getWeek(): Promise<WeekResult> {
  const today = utcToday();
  const todayStr = today.toISOString().slice(0, 10);
  const start = periodBounds(today, "week").start;

  const days: string[] = [];
  const cursor = new Date(start);
  for (let i = 0; i < 7; i++) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const allGoals = await db.goals.toArray();
  const goals = allGoals
    .filter((g) => {
      if (g.archived) return false;
      if (g.endDate && g.endDate < todayStr) return false;
      return true;
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

  const categories = await db.categories.toArray();
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const startStr = days[0];
  const endStr = days[6];
  const goalIds = goals.map((g) => g.id);
  const entries =
    goalIds.length === 0
      ? []
      : await db.entries
          .where("goalId")
          .anyOf(goalIds)
          .and((e) => e.date >= startStr && e.date <= endStr)
          .toArray();
  const entryByGoalAndDay = new Map(
    entries.map((e) => [`${e.goalId}_${e.date}`, { done: e.done, value: e.value }])
  );

  return {
    days,
    goals: goals.map((goal) => {
      const category = goal.categoryId ? categoryById.get(goal.categoryId) : undefined;
      return {
        id: goal.id,
        title: goal.title,
        icon: goal.icon,
        type: goal.type,
        unit: goal.unit,
        targetValue: goal.targetValue,
        step: goal.step,
        category: category ? { name: category.name, color: category.color } : null,
        entries: Object.fromEntries(days.map((day) => [day, entryByGoalAndDay.get(`${goal.id}_${day}`) ?? null])),
      };
    }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/storage/__tests__/week.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full test suite, typecheck, and lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: every test passes (Phases 1–2's 44 storage tests + this phase's 11 new ones + all 83 pre-existing tests = 138), no type errors, no lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/week.ts src/lib/storage/__tests__/week.test.ts
git commit -m "feat: add local week repository (7-day grid for Woche)"
```

---

## Self-Review Notes

- **Spec coverage:** Spec §5 Phase 3 ("Stats + Week — Auswertungs- und Wochenansicht-Aggregation") → Task 1 (`getStats`) and Task 2 (`getWeek`) cover exactly this, mirroring `route.ts`'s current (already backfill-bug-fixed) behavior line for line.
- **Placeholder scan:** none — every step has runnable code and exact assertions.
- **Type consistency:** `DayStat` (Task 1) and `WeekResult`/`WeekGoal`/`WeekEntry` (Task 2) are the exact names and shapes Phase 6's UI wiring will import — `WeekGoal`/`WeekEntry` deliberately match `src/app/woche/page.tsx`'s current local interfaces of the same names so that page's JSX needs no changes beyond swapping its `fetch("/api/week")` call for `getWeek()`.

## What Phase 4 needs from this phase (for the next plan document)

- Phase 4 (Export/Import) needs to serialize/deserialize all four Dexie tables (`categories`, `goals`, `entries`, `milestones`) wholesale — it does not depend on `stats.ts`/`week.ts`, which are read-only aggregations with no persisted state of their own. Phase 4 can be planned independently of this phase's specifics.
