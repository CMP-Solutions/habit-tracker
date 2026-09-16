# Goal Pause/Reminders/Motivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three additive extensions to the existing Goal feature: a "skip today" pause that protects the streak without counting as success, an optional per-goal reminder time, and an optional per-goal motivation ("Warum") text shown only on the goal detail page.

**Architecture:** `EntryRecord` gains `skipped`/`skipReason`, `GoalRecord` gains `reminderTime`/`motivation` — both additive, no Dexie version bump. The domain streak functions treat a `skipped` day as transparent (neither breaks nor extends the streak). Every storage function that currently builds `{date, success}` from entries threads `skipped` through unchanged otherwise. UI adds a skip dialog (reused for boolean and quantitative goals), a paused-state render in `GoalCard`, a grayed cell in the Woche view, new form fields, and a `setInterval`-driven per-goal reminder check on the dashboard.

**Tech Stack:** Next.js App Router, TypeScript, Dexie (IndexedDB), Tailwind, shadcn/ui (base-ui primitives), Vitest + fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-09-16-goal-pause-reminders-motivation-design.md`

## Global Constraints

- No Dexie `db.version()` bump — new fields are additive and unindexed.
- A `skipped` day never breaks a streak and never extends it (transparent), and never counts toward period-target progress or the total-count milestone.
- Old (pre-migration) rows in a real user's IndexedDB won't have the new fields at all — every read site must treat a missing `skipped`/`reminderTime`/`motivation` as `false`/`null`, not assume the declared TypeScript type reflects runtime reality.
- Skip is only possible for **today** — no retroactive skip in this iteration.
- Reminders remain a plain browser `Notification`, only while the tab is open — no service worker, no push.

---

### Task 1: Domain layer — `skipped` support in streak calculation

**Files:**
- Modify: `src/lib/domain/streak.ts`
- Modify: `src/lib/domain/densify.ts`
- Test: `src/lib/domain/__tests__/streak.test.ts`
- Test: `src/lib/domain/__tests__/densify.test.ts`

**Interfaces:**
- Produces: `DailyResult { date: string; success: boolean; skipped?: boolean }` (extended), `calculateCurrentStreak(results: DailyResult[]): number`, `calculateLongestStreak(results: DailyResult[]): number` (both updated to treat `skipped` as transparent — unchanged signature), `densifyDailyResults(entries: { date: Date; success: boolean; skipped?: boolean }[], from: Date, to: Date): DailyResult[]` (updated to carry `skipped` through, always present as `true`/`false` in its output).

- [ ] **Step 1: Write the failing tests for streak skip-transparency**

Add to `src/lib/domain/__tests__/streak.test.ts` (keep the existing `day` helper and all existing tests as-is):

```ts
const skippedDay = (date: string) => ({ date, success: false, skipped: true });

describe("calculateCurrentStreak with skipped days", () => {
  it("does not break the streak on a skipped day", () => {
    const results = [
      day("2026-09-07", true),
      skippedDay("2026-09-08"),
      day("2026-09-09", true),
    ];
    expect(calculateCurrentStreak(results)).toBe(2);
  });

  it("does not extend the streak count for the skipped day itself", () => {
    const results = [day("2026-09-08", true), skippedDay("2026-09-09")];
    // Only 2026-09-08 counts; the skip is transparent, not an extra +1.
    expect(calculateCurrentStreak(results)).toBe(1);
  });

  it("still breaks on a real failure even after a skip", () => {
    const results = [
      day("2026-09-07", true),
      skippedDay("2026-09-08"),
      day("2026-09-09", false),
    ];
    expect(calculateCurrentStreak(results)).toBe(0);
  });
});

describe("calculateLongestStreak with skipped days", () => {
  it("bridges a skipped day without resetting the run", () => {
    const results = [
      day("2026-09-01", true),
      day("2026-09-02", true),
      skippedDay("2026-09-03"),
      day("2026-09-04", true),
      day("2026-09-05", false),
    ];
    expect(calculateLongestStreak(results)).toBe(3);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/domain/__tests__/streak.test.ts`
Expected: FAIL — the new skip-related assertions don't match current behavior (a skipped day currently breaks the streak, since `success: false`).

- [ ] **Step 3: Update `calculateCurrentStreak`/`calculateLongestStreak`**

Replace the full contents of `src/lib/domain/streak.ts` with:

```ts
export interface DailyResult {
  date: string;
  success: boolean;
  /** A day the user explicitly paused: doesn't break the streak, doesn't extend it either. */
  skipped?: boolean;
}

export function calculateCurrentStreak(results: DailyResult[]): number {
  let streak = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].skipped) continue;
    if (!results[i].success) break;
    streak++;
  }
  return streak;
}

export function calculateLongestStreak(results: DailyResult[]): number {
  let longest = 0;
  let current = 0;
  for (const result of results) {
    if (result.skipped) continue;
    if (result.success) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

export function calculateTotalSuccessCount(results: DailyResult[]): number {
  return results.filter((r) => r.success).length;
}
```

- [ ] **Step 4: Run to verify the streak tests pass**

Run: `npx vitest run src/lib/domain/__tests__/streak.test.ts`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Update `densify.test.ts` for the new `skipped` field on every output element**

Replace the full contents of `src/lib/domain/__tests__/densify.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { densifyDailyResults } from "../densify";
import { calculateCurrentStreak, calculateLongestStreak } from "../streak";

const utc = (date: string) => new Date(date + "T00:00:00Z");

describe("densifyDailyResults", () => {
  it("returns one element per calendar day, inclusive of both bounds", () => {
    const results = densifyDailyResults([], utc("2026-09-01"), utc("2026-09-03"));
    expect(results).toEqual([
      { date: "2026-09-01", success: false, skipped: false },
      { date: "2026-09-02", success: false, skipped: false },
      { date: "2026-09-03", success: false, skipped: false },
    ]);
  });

  it("fills days without an entry as failures", () => {
    const results = densifyDailyResults(
      [
        { date: utc("2026-09-01"), success: true },
        { date: utc("2026-09-04"), success: true },
      ],
      utc("2026-09-01"),
      utc("2026-09-04")
    );
    expect(results.map((r) => r.success)).toEqual([true, false, false, true]);
  });

  it("keeps a single day range to one element", () => {
    const results = densifyDailyResults(
      [{ date: utc("2026-09-10"), success: true }],
      utc("2026-09-10"),
      utc("2026-09-10")
    );
    expect(results).toEqual([{ date: "2026-09-10", success: true, skipped: false }]);
  });

  it("ignores entries outside the requested range", () => {
    const results = densifyDailyResults(
      [
        { date: utc("2026-08-01"), success: true },
        { date: utc("2026-09-02"), success: true },
      ],
      utc("2026-09-01"),
      utc("2026-09-02")
    );
    expect(results).toEqual([
      { date: "2026-09-01", success: false, skipped: false },
      { date: "2026-09-02", success: true, skipped: false },
    ]);
  });

  it("returns an empty array when `to` precedes `from`", () => {
    expect(densifyDailyResults([], utc("2026-09-05"), utc("2026-09-01"))).toEqual([]);
  });

  it("truncates time-of-day on the bounds", () => {
    const results = densifyDailyResults([], new Date("2026-09-01T17:45:00Z"), new Date("2026-09-02T03:00:00Z"));
    expect(results.map((r) => r.date)).toEqual(["2026-09-01", "2026-09-02"]);
  });

  it("makes a calendar gap break the streak", () => {
    const sparse = [
      { date: utc("2026-09-01"), success: true },
      { date: utc("2026-09-10"), success: true },
    ];

    // Without densification the streak functions would see [true, true].
    const dense = densifyDailyResults(sparse, utc("2026-09-01"), utc("2026-09-10"));
    expect(dense).toHaveLength(10);
    expect(calculateCurrentStreak(dense)).toBe(1);
    expect(calculateLongestStreak(dense)).toBe(1);
  });

  it("crosses a month boundary correctly", () => {
    const results = densifyDailyResults([], utc("2026-09-29"), utc("2026-10-02"));
    expect(results.map((r) => r.date)).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
  });

  it("carries a skipped day through as skipped, not as a failure", () => {
    const results = densifyDailyResults(
      [{ date: utc("2026-09-02"), success: false, skipped: true }],
      utc("2026-09-01"),
      utc("2026-09-03")
    );
    expect(results).toEqual([
      { date: "2026-09-01", success: false, skipped: false },
      { date: "2026-09-02", success: false, skipped: true },
      { date: "2026-09-03", success: false, skipped: false },
    ]);
  });

  it("a skipped day bridges a streak across the gap", () => {
    const dense = densifyDailyResults(
      [
        { date: utc("2026-09-01"), success: true },
        { date: utc("2026-09-02"), success: false, skipped: true },
        { date: utc("2026-09-03"), success: true },
      ],
      utc("2026-09-01"),
      utc("2026-09-03")
    );
    expect(calculateCurrentStreak(dense)).toBe(2);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run src/lib/domain/__tests__/densify.test.ts`
Expected: FAIL — current `densifyDailyResults` output has no `skipped` key at all, so every `toEqual` fails.

- [ ] **Step 7: Update `densifyDailyResults`**

Replace the full contents of `src/lib/domain/densify.ts` with:

```ts
import { DailyResult } from "./streak";

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Expands a sparse list of recorded entries into a gapless array of calendar
 * days from `from` through `to` (both inclusive).
 *
 * Streak calculation requires one element per calendar day: a day without an
 * entry is a failed day, not an absent one. Feeding only the recorded rows into
 * `calculateCurrentStreak` would make "checked in once a week for seven weeks"
 * look like a seven day streak.
 *
 * Days are keyed by their UTC date, matching how entries are stored
 * (UTC midnight representing a calendar day).
 */
export function densifyDailyResults(
  entries: { date: Date; success: boolean; skipped?: boolean }[],
  from: Date,
  to: Date
): DailyResult[] {
  const byDate = new Map<string, { success: boolean; skipped: boolean }>();
  for (const entry of entries) {
    const key = utcDayKey(entry.date);
    const existing = byDate.get(key) ?? { success: false, skipped: false };
    // A day counts as a success if any entry for that day succeeded, and as
    // skipped if any entry for that day was skipped (in practice there's at
    // most one entry per goal+day, so this is really just "this day's entry").
    byDate.set(key, {
      success: existing.success || entry.success,
      skipped: existing.skipped || !!entry.skipped,
    });
  }

  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));

  const results: DailyResult[] = [];
  while (cursor.getTime() <= end.getTime()) {
    const key = utcDayKey(cursor);
    const day = byDate.get(key);
    results.push({ date: key, success: day?.success ?? false, skipped: day?.skipped ?? false });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return results;
}
```

- [ ] **Step 8: Run both domain test files to verify all pass**

Run: `npx vitest run src/lib/domain/__tests__/streak.test.ts src/lib/domain/__tests__/densify.test.ts`
Expected: PASS

- [ ] **Step 9: Typecheck and commit**

Run: `npx tsc --noEmit` (expect existing storage-layer errors about missing `skipped` on entry-mapping call sites — those are fixed in Tasks 3-6; domain files themselves must be clean)

```bash
git add src/lib/domain/streak.ts src/lib/domain/densify.ts src/lib/domain/__tests__/streak.test.ts src/lib/domain/__tests__/densify.test.ts
git commit -m "feat: make skipped days transparent to streak calculation"
```

---

### Task 2: Schema — `EntryRecord`/`GoalRecord` new fields, `CreateGoalInput` extension

**Files:**
- Modify: `src/lib/storage/db.ts`
- Modify: `src/lib/storage/goals.ts:12-77` (`CreateGoalInput`, `createGoal`)
- Modify: `src/lib/__tests__/reminders.test.ts:5-29` (the `goal()` test helper)
- Test: `src/lib/storage/__tests__/goals.test.ts`

**Interfaces:**
- Consumes: nothing new from earlier tasks.
- Produces: `EntryRecord { ...; skipped: boolean; skipReason: string | null }`, `GoalRecord { ...; reminderTime: string | null; motivation: string | null }`, `CreateGoalInput { ...; reminderTime?: string; motivation?: string }`. `createGoal` persists both new fields (`null` when omitted). `updateGoal` already spreads `Partial<CreateGoalInput>` into the DB record, so no code change is needed there for these two fields to be editable — only the type extension above is required.

- [ ] **Step 1: Extend the Dexie record types**

In `src/lib/storage/db.ts`, update `EntryRecord`:

```ts
export interface EntryRecord {
  id: string;
  goalId: string;
  /** "YYYY-MM-DD", UTC calendar day. */
  date: string;
  done: boolean;
  value: number | null;
  /** True when the user explicitly paused this goal for this day. */
  skipped: boolean;
  /** Optional free-text reason entered when skipping; null if none given. */
  skipReason: string | null;
}
```

And `GoalRecord`, adding after `createdAt`:

```ts
  /** "YYYY-MM-DD" — the day the goal was created, UTC. */
  createdAt: string;
  /** "HH:mm" 24h local time for a per-goal reminder, or null for none. */
  reminderTime: string | null;
  /** Optional free text: why this goal matters, shown only on its detail page. */
  motivation: string | null;
```

No changes to `db.version(1).stores(...)` — these are new plain fields, not new indexes.

- [ ] **Step 2: Write the failing test for `createGoal` persisting the new fields**

Add to `src/lib/storage/__tests__/goals.test.ts` (find the existing `describe("createGoal"` block and add inside it):

```ts
  it("persists an optional reminderTime and motivation, defaulting both to null", async () => {
    const withExtras = await createGoal({
      title: "Meditieren",
      type: "boolean",
      periodicity: "daily",
      reminderTime: "21:00",
      motivation: "Für den inneren Frieden.",
    });
    expect(withExtras.reminderTime).toBe("21:00");
    expect(withExtras.motivation).toBe("Für den inneren Frieden.");

    const withoutExtras = await createGoal({ title: "Lesen", type: "boolean", periodicity: "daily" });
    expect(withoutExtras.reminderTime).toBeNull();
    expect(withoutExtras.motivation).toBeNull();
  });
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/lib/storage/__tests__/goals.test.ts -t "reminderTime"`
Expected: FAIL with a type error or `undefined` instead of the expected values (the fields don't exist on `CreateGoalInput`/`createGoal` yet).

- [ ] **Step 4: Extend `CreateGoalInput` and `createGoal` in `src/lib/storage/goals.ts`**

In the `CreateGoalInput` interface (`src/lib/storage/goals.ts:12-26`), add after `endDate?: string | null;`:

```ts
  reminderTime?: string;
  motivation?: string;
```

In `createGoal`'s constructed `goal` object (`src/lib/storage/goals.ts:57-74`), add after `createdAt: utcTodayString(),`:

```ts
    reminderTime: input.reminderTime ?? null,
    motivation: input.motivation ?? null,
```

- [ ] **Step 5: Run to verify the test passes**

Run: `npx vitest run src/lib/storage/__tests__/goals.test.ts -t "reminderTime"`
Expected: PASS

- [ ] **Step 6: Fix the now-broken `reminders.test.ts` helper**

`GoalWithProgress extends GoalRecord`, so the `goal()` helper in `src/lib/__tests__/reminders.test.ts` now needs the two new fields. In the object returned by `goal()` (`src/lib/__tests__/reminders.test.ts:6-28`), add after `createdAt: "2026-09-01",`:

```ts
    reminderTime: null,
    motivation: null,
```

- [ ] **Step 7: Run the full suite to confirm nothing else broke by the type extension**

Run: `npx tsc --noEmit`
Expected: Errors only in `src/lib/storage/entries.ts`, `src/lib/storage/goals.ts` (the `EntryRecord` literals missing `skipped`/`skipReason`), `src/lib/storage/milestones.ts`, `src/lib/storage/week.ts` — all fixed in Tasks 3-6. No errors in `reminders.test.ts` or `goals.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/storage/db.ts src/lib/storage/goals.ts src/lib/__tests__/reminders.test.ts src/lib/storage/__tests__/goals.test.ts
git commit -m "feat: add reminderTime/motivation to GoalRecord, skipped/skipReason to EntryRecord"
```

---

### Task 3: `recordSkip` + `deleteEntry` + `recordEntry` skip-awareness

**Files:**
- Modify: `src/lib/storage/entries.ts`
- Test: `src/lib/storage/__tests__/entries.test.ts`

**Interfaces:**
- Consumes: `EntryRecord.skipped`/`skipReason` (Task 2), `DailyResult.skipped` (Task 1).
- Produces: `recordSkip(input: { goalId: string; date: string; reason?: string }): Promise<{ entry: EntryRecord }>`, `deleteEntry(input: { goalId: string; date: string }): Promise<void>`. `recordEntry` now resets `skipped`/`skipReason` to `false`/`null` when a real value is recorded, and threads `skipped` into the streak/milestone evaluation.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/storage/__tests__/entries.test.ts` (new `describe` blocks; keep all existing tests):

```ts
describe("recordSkip", () => {
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
    expect(milestones).toHaveLength(0);
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
```

Update the test file's import line to include the three new functions:

```ts
import { recordEntry, recordSkip, deleteEntry } from "../entries";
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/storage/__tests__/entries.test.ts`
Expected: FAIL — `recordSkip`/`deleteEntry` don't exist yet.

- [ ] **Step 3: Implement `recordSkip`, `deleteEntry`, and update `recordEntry`**

In `src/lib/storage/entries.ts`, change the `entry` object built inside `recordEntry` (currently around line 33-39) to also reset skip state:

```ts
  const entry: EntryRecord = {
    id: existing?.id ?? generateId(),
    goalId: input.goalId,
    date: input.date,
    done: !!input.done,
    value: input.value ?? null,
    // Recording a real check-in always supersedes a previous skip for this day.
    skipped: false,
    skipReason: null,
  };
```

Change the `recorded` mapping (currently around line 43-46) to carry `skipped` through, reading defensively since rows written before this feature shipped won't have the field at all:

```ts
  const recorded = allEntries.map((e) => ({
    date: parseUtcDateString(e.date) as Date,
    success: goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity),
    skipped: e.skipped ?? false,
  }));
```

Add these two new exported functions at the end of the file:

```ts
/**
 * Marks `date` as an intentional pause for `goalId`: protects the streak
 * (see `calculateCurrentStreak`'s `skipped` handling) without counting as a
 * success anywhere — never awards a milestone, never advances period
 * progress. Overwrites any existing entry for that day, same as
 * `recordEntry`.
 */
export async function recordSkip(input: {
  goalId: string;
  date: string;
  reason?: string;
}): Promise<{ entry: EntryRecord }> {
  if (typeof input.goalId !== "string" || input.goalId.length === 0) {
    throw new Error("goalId is required.");
  }
  if (typeof input.date !== "string" || !DATE_PATTERN.test(input.date)) {
    throw new Error("date must be a calendar date in YYYY-MM-DD format.");
  }
  if (!parseUtcDateString(input.date)) {
    throw new Error("date is not a valid calendar date.");
  }

  const goal = await db.goals.get(input.goalId);
  if (!goal) throw new Error("Not found");

  const existing = await db.entries.where("[goalId+date]").equals([input.goalId, input.date]).first();
  const reason = input.reason?.trim();
  const entry: EntryRecord = {
    id: existing?.id ?? generateId(),
    goalId: input.goalId,
    date: input.date,
    done: false,
    value: null,
    skipped: true,
    skipReason: reason ? reason : null,
  };
  await db.entries.put(entry);
  return { entry };
}

/** Removes the entry (real or skipped) for `goalId` on `date`, if any — used to undo an accidental skip. */
export async function deleteEntry(input: { goalId: string; date: string }): Promise<void> {
  const existing = await db.entries.where("[goalId+date]").equals([input.goalId, input.date]).first();
  if (existing) await db.entries.delete(existing.id);
}
```

- [ ] **Step 4: Run to verify all entries tests pass**

Run: `npx vitest run src/lib/storage/__tests__/entries.test.ts`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit` (still expect pre-existing errors in `goals.ts`, `milestones.ts`, `week.ts` — Tasks 4-6)

```bash
git add src/lib/storage/entries.ts src/lib/storage/__tests__/entries.test.ts
git commit -m "feat: add recordSkip and deleteEntry for pausing a goal for a day"
```

---

### Task 4: `listGoalsWithProgress` / `getGoalHistory` skip-awareness

**Files:**
- Modify: `src/lib/storage/goals.ts:123-282`
- Test: `src/lib/storage/__tests__/goals.test.ts`

**Interfaces:**
- Consumes: `EntryRecord.skipped`/`skipReason` (Task 2), `DailyResult.skipped` (Task 1).
- Produces: `GoalWithProgress.todayEntry` extended to `{ done: boolean; value: number | null; skipped: boolean; skipReason: string | null } | null`. `listGoalsWithProgress`'s per-goal current streak no longer breaks or advances on a skipped today. `getGoalHistory`'s `results` entries carry `skipped` (feeding Task 1's updated `densifyDailyResults`).

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/storage/__tests__/goals.test.ts` (find the `describe("listGoalsWithProgress"` block and add inside it; adjust the import line to include `recordSkip` from `"../entries"` alongside the existing `recordEntry` import):

```ts
  it("exposes skipped/skipReason on todayEntry when today was skipped", async () => {
    const goal = await createGoal({ title: "Meditieren", type: "boolean", periodicity: "daily" });
    const today = new Date().toISOString().slice(0, 10);
    await recordSkip({ goalId: goal.id, date: today, reason: "Krank" });

    const [found] = await listGoalsWithProgress();
    expect(found.todayEntry).toEqual({ done: false, value: null, skipped: true, skipReason: "Krank" });
  });

  it("does not break or extend the streak when today is skipped", async () => {
    const goal = await createGoal({ title: "Meditieren", type: "boolean", periodicity: "daily" });
    const daysAgo = (n: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - n);
      return d.toISOString().slice(0, 10);
    };
    for (const n of [3, 2, 1]) {
      await recordEntry({ goalId: goal.id, date: daysAgo(n), done: true });
    }
    await recordSkip({ goalId: goal.id, date: daysAgo(0) });

    const [found] = await listGoalsWithProgress();
    expect(found.currentStreak).toBe(3);
  });

  it("does not count a skipped day toward period-target progress", async () => {
    const goal = await createGoal({
      title: "Sport",
      type: "boolean",
      periodicity: "count_per_period",
      periodUnit: "week",
      periodTarget: 3,
    });
    const today = new Date().toISOString().slice(0, 10);
    await recordSkip({ goalId: goal.id, date: today, reason: "Krank" });

    const [found] = await listGoalsWithProgress();
    expect(found.periodProgress?.current).toBe(0);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/storage/__tests__/goals.test.ts -t "skipped"`
Expected: FAIL — `todayEntry` doesn't include `skipped`/`skipReason` yet, and today's skip currently zeroes the streak (since `todaySuccess` is `false` and there's no skip-transparency at that call site).

- [ ] **Step 3: Update `listGoalsWithProgress`**

In `src/lib/storage/goals.ts`, inside the per-goal streak loop (`src/lib/storage/goals.ts:175-207`), change the `results` mapping to carry `skipped`:

```ts
    const results = from > yesterday
      ? []
      : densifyDailyResults(
          entries.map((e) => ({
            date: parseUtcDateString(e.date) as Date,
            success: goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity),
            skipped: e.skipped ?? false,
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
    // A skipped today is transparent, same as any other skipped day: it
    // neither breaks the streak computed through yesterday nor extends it.
    if (!todayEntry?.skipped && todaySuccess) streak++;
    streakByGoal.set(goal.id, streak);
```

Then update the final `return goals.map(...)` block (`src/lib/storage/goals.ts:209-219`) so `todayEntry` carries the new fields:

```ts
  return goals.map((goal) => {
    const entry = entryByGoal.get(goal.id);
    const category = goal.categoryId ? categoryById.get(goal.categoryId) : undefined;
    return {
      ...goal,
      category: category ? { name: category.name, color: category.color } : null,
      todayEntry: entry
        ? { done: entry.done, value: entry.value, skipped: entry.skipped ?? false, skipReason: entry.skipReason ?? null }
        : null,
      periodProgress: periodProgressByGoal.get(goal.id) ?? null,
      currentStreak: streakByGoal.get(goal.id) ?? 0,
    };
  });
```

And update the `GoalWithProgress` interface (`src/lib/storage/goals.ts:123-128`):

```ts
export interface GoalWithProgress extends GoalRecord {
  category: { name: string; color: string } | null;
  todayEntry: { done: boolean; value: number | null; skipped: boolean; skipReason: string | null } | null;
  periodProgress: { current: number; target: number } | null;
  currentStreak: number;
}
```

- [ ] **Step 4: Update `getGoalHistory`'s entry mapping**

In `src/lib/storage/goals.ts:252-261`, add `skipped` to the mapped entries:

```ts
  const results = from > today
    ? []
    : densifyDailyResults(
        entries.map((e) => ({
          date: parseUtcDateString(e.date) as Date,
          success: goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity),
          skipped: e.skipped ?? false,
        })),
        from,
        today
      );
```

- [ ] **Step 5: Run to verify the goals tests pass**

Run: `npx vitest run src/lib/storage/__tests__/goals.test.ts`
Expected: PASS (all tests, old and new)

- [ ] **Step 6: Fix any other test files that assert an exact `todayEntry`/`GoalWithProgress` shape**

Run: `npx vitest run` and check for failures outside `goals.test.ts` caused by the `todayEntry` shape change (e.g. `reminders.test.ts`'s `goal()` helper passes `todayEntry: { done: true, value: null }` in some cases — those object literals are fine as-is since `skipped`/`skipReason` are only read, never asserted, by `countOpenGoals`; but if `tsc` flags a missing-property error on any such literal in a test file, add `skipped: false, skipReason: null` to that literal).

Run: `npx tsc --noEmit`
Expected: Errors only in `src/lib/storage/milestones.ts` and `src/lib/storage/week.ts` (Tasks 5-6).

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage/goals.ts src/lib/storage/__tests__/goals.test.ts
git commit -m "feat: thread skipped/skipReason through listGoalsWithProgress and getGoalHistory"
```

---

### Task 5: `getMilestones` skip-awareness

**Files:**
- Modify: `src/lib/storage/milestones.ts`
- Test: `src/lib/storage/__tests__/milestones.test.ts`

**Interfaces:**
- Consumes: `EntryRecord.skipped` (Task 2), `DailyResult.skipped` (Task 1).
- Produces: no change to `getMilestones`'s return shape — only its internal streak/total-count computation becomes skip-aware.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/storage/__tests__/milestones.test.ts` (inside the existing `describe` block; the file already imports `recordEntry` — add `recordSkip` alongside it from `"../entries"`):

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/storage/__tests__/milestones.test.ts -t "skipped today"`
Expected: FAIL — the skip currently isn't threaded through, so it's treated as a failed day and the streak reads as 0.

- [ ] **Step 3: Update `getMilestones`'s entry mapping**

In `src/lib/storage/milestones.ts`, find the `recorded` mapping (around line 65-68) and add `skipped`:

```ts
    const recorded = entries.map((e) => ({
      date: parseUtcDateString(e.date) as Date,
      success: goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity),
      skipped: e.skipped ?? false,
    }));
```

- [ ] **Step 4: Run to verify the milestones tests pass**

Run: `npx vitest run src/lib/storage/__tests__/milestones.test.ts`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit` (expect remaining errors only in `src/lib/storage/week.ts`, Task 6)

```bash
git add src/lib/storage/milestones.ts src/lib/storage/__tests__/milestones.test.ts
git commit -m "feat: make getMilestones streak progress skip-aware"
```

---

### Task 6: `getWeek` — `WeekEntry.skipped`/`skipReason`

**Files:**
- Modify: `src/lib/storage/week.ts`
- Test: `src/lib/storage/__tests__/week.test.ts`

**Interfaces:**
- Consumes: `EntryRecord.skipped`/`skipReason` (Task 2).
- Produces: `WeekEntry { done: boolean; value: number | null; skipped: boolean; skipReason: string | null }`.

- [ ] **Step 1: Update the existing exact-equality assertion and add a new test**

In `src/lib/storage/__tests__/week.test.ts`, change the existing assertion in `"includes an entry keyed by day..."` (line 32):

```ts
    expect(found?.entries[days[0]]).toEqual({ done: true, value: null, skipped: false, skipReason: null });
```

Add a new test in the same `describe` block, importing `recordSkip` from `"../entries"` alongside the existing `recordEntry` import:

```ts
  it("carries skipped/skipReason through for a paused day", async () => {
    const goal = await createGoal({ title: "Wasser trinken", type: "boolean", periodicity: "daily" });
    const { days } = await getWeek();
    await recordSkip({ goalId: goal.id, date: days[0], reason: "Krank" });

    const { goals } = await getWeek();
    const found = goals.find((g) => g.id === goal.id);
    expect(found?.entries[days[0]]).toEqual({ done: false, value: null, skipped: true, skipReason: "Krank" });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/storage/__tests__/week.test.ts`
Expected: FAIL — `WeekEntry` doesn't carry `skipped`/`skipReason` yet.

- [ ] **Step 3: Update `WeekEntry` and the entry map in `getWeek`**

In `src/lib/storage/week.ts`, update the `WeekEntry` interface:

```ts
export interface WeekEntry {
  done: boolean;
  value: number | null;
  skipped: boolean;
  skipReason: string | null;
}
```

And the `entryByGoalAndDay` map construction:

```ts
  const entryByGoalAndDay = new Map(
    entries.map((e) => [
      `${e.goalId}_${e.date}`,
      { done: e.done, value: e.value, skipped: e.skipped ?? false, skipReason: e.skipReason ?? null },
    ])
  );
```

- [ ] **Step 4: Run to verify the week tests pass**

Run: `npx vitest run src/lib/storage/__tests__/week.test.ts`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Full storage-layer typecheck and test run**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: Both clean — this closes out all storage-layer `skipped` threading (Tasks 3-6).

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/week.ts src/lib/storage/__tests__/week.test.ts
git commit -m "feat: carry skipped/skipReason through the Woche view's WeekEntry"
```

---

### Task 7: Reminders — `shouldNotifyForGoal`

**Files:**
- Modify: `src/lib/reminders.ts`
- Test: `src/lib/__tests__/reminders.test.ts`

**Interfaces:**
- Consumes: `GoalRecord.reminderTime` (Task 2).
- Produces: `shouldNotifyForGoal(params: { reminderTime: string | null; isOpen: boolean; enabled: boolean; permissionGranted: boolean; now: Date; lastNotifiedKey: string | null; todayKey: string }): boolean`, `goalReminderMessage(goalTitle: string): string`, `goalReminderStorageKey(goalId: string): string` (returns `` `ritual:goal-reminder-last:${goalId}` ``, used by the dashboard wiring in Task 12 to read/write the per-goal last-notified date).

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/__tests__/reminders.test.ts`:

```ts
describe("goalReminderStorageKey", () => {
  it("namespaces the key by goal id", () => {
    expect(goalReminderStorageKey("g1")).toBe("ritual:goal-reminder-last:g1");
  });
});

describe("goalReminderMessage", () => {
  it("names the specific goal", () => {
    expect(goalReminderMessage("Wasser trinken")).toBe("Zeit für: Wasser trinken");
  });
});

describe("shouldNotifyForGoal", () => {
  const baseParams = {
    reminderTime: "21:00",
    isOpen: true,
    enabled: true,
    permissionGranted: true,
    now: new Date("2026-09-15T21:05:00"),
    lastNotifiedKey: null as string | null,
    todayKey: "2026-09-15",
  };

  it("fires once the reminder time has passed, goal still open, not yet notified today", () => {
    expect(shouldNotifyForGoal(baseParams)).toBe(true);
  });

  it("does not fire before the reminder time", () => {
    expect(shouldNotifyForGoal({ ...baseParams, now: new Date("2026-09-15T20:59:00") })).toBe(false);
  });

  it("does not fire when the goal has no reminderTime set", () => {
    expect(shouldNotifyForGoal({ ...baseParams, reminderTime: null })).toBe(false);
  });

  it("does not fire when the goal is already done today", () => {
    expect(shouldNotifyForGoal({ ...baseParams, isOpen: false })).toBe(false);
  });

  it("does not fire twice on the same day", () => {
    expect(shouldNotifyForGoal({ ...baseParams, lastNotifiedKey: "2026-09-15" })).toBe(false);
  });

  it("fires again on a new day", () => {
    expect(shouldNotifyForGoal({ ...baseParams, lastNotifiedKey: "2026-09-14" })).toBe(true);
  });

  it("does not fire when reminders are disabled or permission is missing", () => {
    expect(shouldNotifyForGoal({ ...baseParams, enabled: false })).toBe(false);
    expect(shouldNotifyForGoal({ ...baseParams, permissionGranted: false })).toBe(false);
  });
});
```

Update the import line at the top of the test file:

```ts
import { countOpenGoals, reminderMessage, shouldNotify, shouldNotifyForGoal, goalReminderMessage, goalReminderStorageKey } from "../reminders";
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/__tests__/reminders.test.ts`
Expected: FAIL — the three new exports don't exist yet.

- [ ] **Step 3: Implement the new exports in `src/lib/reminders.ts`**

Add these after the existing `shouldNotify` function:

```ts
export function goalReminderStorageKey(goalId: string): string {
  return `ritual:goal-reminder-last:${goalId}`;
}

export function goalReminderMessage(goalTitle: string): string {
  return `Zeit für: ${goalTitle}`;
}

/**
 * Pure decision for a single goal's own reminder time, mirroring
 * `shouldNotify`'s shape but keyed by a specific "HH:mm" instead of the
 * fixed evening hour. `now` is a full Date (not just an hour) since a
 * specific time-of-day needs minute precision, unlike the generic evening
 * reminder.
 */
export function shouldNotifyForGoal(params: {
  reminderTime: string | null;
  isOpen: boolean;
  enabled: boolean;
  permissionGranted: boolean;
  now: Date;
  lastNotifiedKey: string | null;
  todayKey: string;
}): boolean {
  if (!params.enabled || !params.permissionGranted) return false;
  if (!params.reminderTime) return false;
  if (!params.isOpen) return false;
  if (params.lastNotifiedKey === params.todayKey) return false;

  const [hourStr, minuteStr] = params.reminderTime.split(":");
  const targetMinutes = Number(hourStr) * 60 + Number(minuteStr);
  const nowMinutes = params.now.getHours() * 60 + params.now.getMinutes();
  return nowMinutes >= targetMinutes;
}
```

- [ ] **Step 4: Run to verify all reminders tests pass**

Run: `npx vitest run src/lib/__tests__/reminders.test.ts`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Commit**

```bash
git add src/lib/reminders.ts src/lib/__tests__/reminders.test.ts
git commit -m "feat: add shouldNotifyForGoal for per-goal reminder times"
```

---

### Task 8: `Textarea` UI primitive + `SkipGoalDialog` component

**Files:**
- Create: `src/components/ui/textarea.tsx`
- Create: `src/components/SkipGoalDialog.tsx`

**Interfaces:**
- Consumes: `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter`/`DialogClose` from `src/components/ui/dialog.tsx` (existing), `Button` from `src/components/ui/button.tsx` (existing).
- Produces: `Textarea` (styled native `<textarea>`, same `cn`/className pattern as `Input`). `SkipGoalDialog({ open, onOpenChange, goalTitle, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; goalTitle: string; onConfirm: (reason?: string) => void })` — Task 9 renders this from `GoalCard`.

This task has no independent test — it's pure UI, verified visually in Task 9's manual Playwright pass (matches this project's established convention: domain/storage is unit-tested, UI is verified manually).

- [ ] **Step 1: Create the `Textarea` primitive**

Write `src/components/ui/textarea.tsx`:

```tsx
import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
```

- [ ] **Step 2: Create `SkipGoalDialog`**

Write `src/components/SkipGoalDialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * The confirmation step itself is the "mental hurdle" this is meant to add —
 * a deliberate pause before skipping, not a form the user must fill in. The
 * reason field stays optional; requiring it would just train people to type
 * filler text.
 */
export function SkipGoalDialog({
  open,
  onOpenChange,
  goalTitle,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goalTitle: string;
  onConfirm: (reason?: string) => void;
}) {
  const [reason, setReason] = useState("");

  function handleConfirm() {
    onConfirm(reason.trim() ? reason.trim() : undefined);
    setReason("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>„{goalTitle}" heute überspringen?</DialogTitle>
          <DialogDescription>
            Ein Tag Pause ist völlig okay, wenn's einen guten Grund gibt. Aber lass dich nicht von
            bloßer Antriebslosigkeit abhalten — bleib dran!
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="skip-reason">Grund (optional)</Label>
          <Textarea
            id="skip-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="z.B. krank, unterwegs, ..."
          />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" autoFocus>Doch weitermachen</Button>} />
          <Button variant="destructive" onClick={handleConfirm}>
            Trotzdem überspringen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit && npm run lint`

```bash
git add src/components/ui/textarea.tsx src/components/SkipGoalDialog.tsx
git commit -m "feat: add Textarea primitive and SkipGoalDialog component"
```

---

### Task 9: `GoalCard` — skip button, paused state, undo

**Files:**
- Modify: `src/components/GoalCard.tsx`

**Interfaces:**
- Consumes: `recordSkip`/`deleteEntry` from `src/lib/storage/entries.ts` (Task 3), `SkipGoalDialog` (Task 8), `goal.todayEntry.skipped`/`skipReason` (Task 4, already reaching `GoalCard` via its existing `Goal` prop shape — extend that local interface).

This task has no automated test — manual Playwright verification is Step 5 below, per this project's established UI-testing convention.

- [ ] **Step 1: Extend the local `Goal` interface and imports**

In `src/components/GoalCard.tsx`, update the `Goal` interface's `todayEntry` field and add the new imports:

```tsx
import { recordEntry, recordSkip, deleteEntry } from "@/lib/storage/entries";
import { SkipGoalDialog } from "@/components/SkipGoalDialog";
```

```tsx
  todayEntry?: { done: boolean; value: number | null; skipped: boolean; skipReason: string | null } | null;
```

- [ ] **Step 2: Add skip/undo state and handlers**

Inside `GoalCard`, after the existing `done`/`value` state declarations, add:

```tsx
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const isSkipped = goal.todayEntry?.skipped ?? false;

  async function handleSkip(reason?: string) {
    await recordSkip({ goalId: goal.id, date: todayLocalDate(), reason });
    onChecked();
  }

  async function handleUndoSkip() {
    await deleteEntry({ goalId: goal.id, date: todayLocalDate() });
    setDone(false);
    setValue("");
    onChecked();
  }
```

- [ ] **Step 3: Render the paused state and the skip trigger**

Replace the component's final `return (...)` block's right-hand action area — currently a single `{goal.type === "boolean" ? (...) : (...)}` — with a version that branches on `isSkipped` first, and add the skip link beneath the title/category row for the non-skipped case. The structure becomes:

```tsx
  return (
    <div
      className="flex items-center justify-between gap-4 rounded-lg border border-l-4 bg-card p-4 backdrop-blur-xl"
      style={{ borderLeftColor: accentColor }}
    >
      <div className="min-w-0 space-y-1">
        <Link href={`/goals/${goal.id}`} className="flex items-center gap-2 font-medium hover:underline">
          {goal.icon && <span className="text-lg leading-none">{goal.icon}</span>}
          {goal.title}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {goal.category && <CategoryBadge name={goal.category.name} color={goal.category.color} />}
          {goal.currentStreak > 0 && (
            <span className="flex items-center gap-1 font-mono text-xs text-primary">
              <Flame className="size-3" /> {goal.currentStreak}
            </span>
          )}
        </div>
        {goal.periodProgress && (
          <p className="font-mono text-xs text-muted-foreground">
            {goal.periodProgress.current} von {goal.periodProgress.target} diese Periode
          </p>
        )}
        {!isSkipped && !done && (
          <button
            type="button"
            onClick={() => setSkipDialogOpen(true)}
            className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            Heute überspringen
          </button>
        )}
      </div>

      {isSkipped ? (
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="flex size-10 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground"
            title={goal.todayEntry?.skipReason ?? undefined}
          >
            <Check className="size-4" />
          </span>
          <button
            type="button"
            onClick={handleUndoSkip}
            className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            Rückgängig
          </button>
        </div>
      ) : goal.type === "boolean" ? (
        <div ref={checkboxWrapRef}>
          <Checkbox
            className="size-6 rounded-full [&_svg]:size-4 data-checked:[animation:goal-complete-pop_320ms_ease-out] data-checked:bg-celebrate data-checked:border-celebrate data-checked:text-celebrate-foreground data-checked:shadow-[0_0_10px_-1px_var(--color-celebrate)]"
            checked={done}
            onCheckedChange={(checked) => {
              const next = checked === true;
              setDone(next);
              checkIn(next);
              if (next) celebrateFrom(checkboxWrapRef.current);
            }}
          />
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {done ? (
            <div
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-celebrate text-celebrate-foreground [animation:goal-complete-pop_320ms_ease-out] shadow-[0_0_10px_-1px_var(--color-celebrate)]"
              title="Ziel erreicht"
            >
              <Check className="size-6" />
            </div>
          ) : (
            <ProgressRing value={Number(value) || 0} target={goal.targetValue ?? 0} unit={goal.unit} />
          )}
          <div ref={inputWrapRef}>
            <Input
              type="number"
              className="w-20 font-mono"
              min={0}
              step={goal.step}
              value={value}
              onChange={(e) => handleValueChange(e.target.value)}
              onBlur={handleBlur}
            />
          </div>
          <span className="font-mono text-sm text-muted-foreground">
            / {goal.targetValue} {goal.unit}
          </span>
        </div>
      )}

      <SkipGoalDialog
        open={skipDialogOpen}
        onOpenChange={setSkipDialogOpen}
        goalTitle={goal.title}
        onConfirm={handleSkip}
      />
    </div>
  );
```

Note the skip link is gated on `!done` (in addition to `!isSkipped`) so it disappears once a boolean goal is checked or a quantitative goal reaches its target — skipping something already accomplished today makes no sense. `done` already tracks that correctly via the existing local state.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 5: Manual Playwright verification**

Start the dev server, seed a fresh goal, and verify via `browser_navigate`/`browser_click`/`browser_evaluate` (screenshots have been unreliable in this environment — prefer DOM assertions):
1. "Heute überspringen" appears next to an open goal, not next to an already-checked one.
2. Clicking it opens the dialog with the motivational text and optional reason field.
3. "Doch weitermachen" closes the dialog with no entry recorded (verify via IndexedDB read).
4. "Trotzdem überspringen" (with and without a typed reason) records a `skipped: true` entry (verify via IndexedDB read) and the card switches to the grayed paused state with "Rückgängig".
5. "Rückgängig" removes the entry and restores the checkbox/input.
6. Repeat 1-5 for a quantitative goal.

- [ ] **Step 6: Commit**

```bash
git add src/components/GoalCard.tsx
git commit -m "feat: add skip-today flow and paused state to GoalCard"
```

---

### Task 10: Woche view — grayed skipped cell

**Files:**
- Modify: `src/app/woche/page.tsx`

**Interfaces:**
- Consumes: `WeekEntry.skipped`/`skipReason` (Task 6), `Popover`/`PopoverTrigger`/`PopoverContent` from `src/components/ui/popover.tsx` (existing, built for the milestone medals).

No automated test — manual Playwright verification, same convention as the rest of this Woche page's history in this project.

- [ ] **Step 1: Update `isComplete` and add a skipped branch to `WeekCell`**

In `src/app/woche/page.tsx`, `WeekCell` currently renders a boolean check-button or a quantitative input, deciding via `isComplete(goal, entry)`. Add a skip check ahead of that: change the top of the `WeekCell` function body from:

```tsx
  const [value, setValue] = useState(entry?.value != null ? String(entry.value) : "");
  const complete = isComplete(goal, entry);

  const ringClass = isToday ? "ring-1 ring-primary/40" : "";

  if (goal.type === "boolean") {
```

to:

```tsx
  const [value, setValue] = useState(entry?.value != null ? String(entry.value) : "");
  const complete = isComplete(goal, entry);

  const ringClass = isToday ? "ring-1 ring-primary/40" : "";

  if (entry?.skipped) {
    return (
      <Popover>
        <PopoverTrigger
          className={`mx-auto flex size-10 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground outline-none ${ringClass}`}
          aria-label={entry.skipReason ? `Übersprungen: ${entry.skipReason}` : "Übersprungen"}
        >
          <Check className="size-4" />
        </PopoverTrigger>
        {entry.skipReason && (
          <PopoverContent>
            <p className="text-xs text-muted-foreground">{entry.skipReason}</p>
          </PopoverContent>
        )}
      </Popover>
    );
  }

  if (goal.type === "boolean") {
```

Add the import at the top of the file:

```tsx
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 3: Manual Playwright verification**

Seed a skipped entry (with and without a reason) for a day in the current week via direct IndexedDB write (same pattern used earlier in this project's manual milestone verification), reload `/woche`, and confirm: the cell renders as a grayed circle with a checkmark (not the `celebrate`-colored one), and tapping it shows the reason in a popover when one was given, or nothing extra when it wasn't.

- [ ] **Step 4: Commit**

```bash
git add src/app/woche/page.tsx
git commit -m "feat: render skipped days as a grayed cell in the Woche view"
```

---

### Task 11: `GoalForm` — reminder time + motivation fields

**Files:**
- Modify: `src/components/GoalForm.tsx`

**Interfaces:**
- Consumes: `CreateGoalInput.reminderTime`/`motivation` (Task 2).
- Produces: `ExistingGoal` interface extended with `reminderTime: string | null; motivation: string | null` (structurally compatible with `GoalRecord`, so `src/app/goals/[id]/edit/page.tsx` needs no changes — it already assigns a full `GoalRecord` to this type).

No automated test — this is a plain form, verified manually alongside Task 12's dashboard/detail-page check.

- [ ] **Step 1: Extend `ExistingGoal` and add form state**

In `src/components/GoalForm.tsx`, add to the `ExistingGoal` interface:

```tsx
  reminderTime: string | null;
  motivation: string | null;
```

Add new state alongside the existing `useState` calls:

```tsx
  const [reminderTime, setReminderTime] = useState(existingGoal?.reminderTime ?? "");
  const [motivation, setMotivation] = useState(existingGoal?.motivation ?? "");
```

Add the import for `Textarea`:

```tsx
import { Textarea } from "@/components/ui/textarea";
```

- [ ] **Step 2: Include the new fields in the submitted input**

In `handleSubmit`, add to the `input` object:

```tsx
      reminderTime: reminderTime ? reminderTime : undefined,
      motivation: motivation.trim() ? motivation.trim() : undefined,
```

- [ ] **Step 3: Add the form fields**

Add this block after the existing "Kategorie" section and before the `{error && ...}` line:

```tsx
      <div className="space-y-2">
        <Label htmlFor="reminderTime">Erinnerung um (optional)</Label>
        <Input
          id="reminderTime"
          type="time"
          className="font-mono"
          value={reminderTime}
          onChange={(e) => setReminderTime(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="motivation">Warum ist dir das wichtig? (optional)</Label>
        <Textarea
          id="motivation"
          value={motivation}
          onChange={(e) => setMotivation(e.target.value)}
          placeholder="Nur du siehst das, auf der Detailseite dieses Ziels."
        />
      </div>
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 5: Commit**

```bash
git add src/components/GoalForm.tsx
git commit -m "feat: add optional reminder time and motivation fields to GoalForm"
```

---

### Task 12: Goal detail page motivation display + dashboard per-goal reminder interval

**Files:**
- Modify: `src/app/goals/[id]/page.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `GoalRecord.motivation`/`reminderTime` (Task 2), `shouldNotifyForGoal`/`goalReminderMessage`/`goalReminderStorageKey` (Task 7), `isRemindersEnabled` (existing, from `src/lib/reminders.ts`).

No automated test — this is UI wiring around already-unit-tested pure functions, verified manually.

- [ ] **Step 1: Show motivation on the goal detail page**

In `src/app/goals/[id]/page.tsx`, add this block right after the closing `</div>` of the header (after the `endDate` paragraph, before the streak-stats `<div>`):

```tsx
      {data.goal.motivation && (
        <p className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground italic">
          „{data.goal.motivation}"
        </p>
      )}
```

- [ ] **Step 2: Run to verify the app still typechecks**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Wire the per-goal reminder interval into the dashboard**

In `src/app/page.tsx`, add the import:

```tsx
import {
  countOpenGoals,
  maybeShowReminder,
  isRemindersEnabled,
  shouldNotifyForGoal,
  goalReminderMessage,
  goalReminderStorageKey,
} from "@/lib/reminders";
```

Add this function above `DashboardPage` (module scope, so it doesn't get recreated every render — it takes the current goals as a parameter instead of closing over component state):

```tsx
function checkGoalReminders(goals: GoalWithProgress[]) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  for (const goal of goals) {
    if (!goal.reminderTime) continue;
    // A goal already skipped today was a deliberate decision not to do it —
    // nagging about it anyway would undercut the point of being able to skip.
    const isOpen = goal.todayEntry?.skipped
      ? false
      : goal.type === "boolean"
        ? !(goal.todayEntry?.done ?? false)
        : (goal.todayEntry?.value ?? 0) < (goal.targetValue ?? Infinity);
    const key = goalReminderStorageKey(goal.id);
    const fire = shouldNotifyForGoal({
      reminderTime: goal.reminderTime,
      isOpen,
      enabled: isRemindersEnabled(),
      permissionGranted: true,
      now,
      lastNotifiedKey: localStorage.getItem(key),
      todayKey,
    });
    if (!fire) continue;
    new Notification("Ritual", { body: goalReminderMessage(goal.title) });
    localStorage.setItem(key, todayKey);
  }
}
```

Inside `DashboardPage`, add a new effect after the existing data-loading `useEffect` that starts a 60-second interval, cleaned up on unmount:

```tsx
  useEffect(() => {
    const interval = setInterval(() => {
      listGoalsWithProgress().then(checkGoalReminders);
    }, 60_000);
    return () => clearInterval(interval);
  }, []);
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`

- [ ] **Step 5: Manual Playwright verification**

1. Create a goal with `reminderTime` set a minute or two in the past (via the form, or a direct IndexedDB write for speed), enable reminders in Settings, grant notification permission.
2. Confirm `data.goal.motivation` renders (italic, quoted) on the goal's detail page when set, and that the Woche/Dashboard/Milestones views never show it.
3. Confirm the dashboard's 60-second interval is running (`browser_evaluate` can advance fake timers isn't available in a real browser — instead, verify the code path directly by calling the exported `shouldNotifyForGoal`/`checkGoalReminders` logic through a short manual wait, or by temporarily setting `reminderTime` to "now" and observing the `Notification` call via a `browser_evaluate` override of `window.Notification` that records calls).

- [ ] **Step 6: Full-suite verification and commit**

Run: `npx tsc --noEmit && npm run lint && npm test -- --run && npm run build`
Expected: All clean.

```bash
git add src/app/goals/[id]/page.tsx src/app/page.tsx
git commit -m "feat: show goal motivation on detail page and check per-goal reminders on the dashboard"
```

---

### Task 13: Finish the branch

**Files:** none (process step)

- [ ] **Step 1: Full verification sweep**

Run: `npx tsc --noEmit && npm run lint && npm test -- --run && npm run build`
Expected: All clean, 0 test failures.

- [ ] **Step 2: Rebase onto latest `origin/main` and push**

Per this project's established workflow (see memory `habit_tracker_workflow`): commit locally on `worktree-habit-tracker-mvp`, then push straight to `main`, no feature-branch PR.

```bash
git fetch origin main
git rebase origin/main
npx tsc --noEmit && npm test -- --run   # re-verify after rebase
git push origin worktree-habit-tracker-mvp:main
```

- [ ] **Step 3: Report to the user**

Summarize what shipped (skip/pause flow, per-goal reminders, motivation field), how it was verified (test counts, manual Playwright checks performed), and note the two things intentionally deferred per the spec's "Out of Scope" section (retroactive skipping, skip counting as a real success anywhere).
