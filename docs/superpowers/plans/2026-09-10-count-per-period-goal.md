# Count-Per-Period Goal Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third goal periodicity, `"count_per_period"` — "X times within a fixed calendar week or month" — alongside the existing `"daily"` and `"weekly"` (X-of-7-days) periodicities.

**Architecture:** Extend the `Goal` Prisma model with two nullable fields (`periodUnit`, `periodTarget`). Add one new pure domain module (`periodCount.ts`) that reuses the existing `groupIntoWeeks`/streak/milestone machinery rather than duplicating it — a "period" becomes just another `DailyResult` in the same streak chain used by `weekly` goals today. Wire the new branch into the existing `POST /api/entries` evaluation logic, add validation to `POST`/`PATCH /api/goals`, surface current-period progress from `GET /api/goals`, and add the corresponding UI in `GoalForm` and `GoalCard`.

**Tech Stack:** Same as the existing project — Next.js App Router, Prisma + PostgreSQL, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-10-count-per-period-goal-design.md`

## Global Constraints

- `count_per_period` is selectable only when `type === "boolean"` — never for `type === "quantitative"` (spec §2, §5).
- `periodUnit` must be exactly `"week"` or `"month"`; `periodTarget` must be a positive integer. Both are required when `periodicity === "count_per_period"` (spec §4).
- The existing `"weekly"` (X-of-7-days) periodicity is untouched — `count_per_period` is a fully independent third option (spec §1).
- Streak/milestone computation for `count_per_period` reuses `calculateCurrentStreak`, `calculateLongestStreak`, `calculateTotalSuccessCount` (`src/lib/domain/streak.ts`) and `determineNewMilestones` (`src/lib/domain/milestones.ts`) unchanged — no duplicated streak logic (spec §3).
- Heatmap/trend chart continue to show individual days regardless of periodicity — no changes to `Heatmap.tsx`/`TrendChart.tsx`/the history route in this plan (spec §5).
- This plan does NOT add general enum/conditional validation to `PATCH /api/goals/[id]` beyond what `count_per_period` specifically requires — the broader pre-existing gap (PATCH accepts any `periodicity`/`type` combination without validation) is out of scope, tracked separately.
- Migration must be additive (nullable columns) — no existing data affected.

---

## File Structure

```
prisma/schema.prisma                          # Modify: add periodUnit, periodTarget to Goal
src/lib/domain/
  periodCount.ts                              # Create: groupIntoCalendarPeriods, evaluatePeriod, periodBounds
  __tests__/periodCount.test.ts               # Create
src/app/api/
  goals/route.ts                              # Modify: POST validation + GET periodProgress
  goals/[id]/route.ts                         # Modify: PATCH validation
  goals/route.test.ts                         # Modify: add coverage
  entries/route.ts                            # Modify: third evaluation branch
  entries/route.test.ts                       # Modify: add coverage
src/components/
  GoalForm.tsx                                # Modify: new periodicity option + fields
  GoalCard.tsx                                # Modify: period progress line
src/app/page.tsx                              # Modify: Goal interface gains periodProgress
```

---

### Task 1: Prisma schema — add `periodUnit`/`periodTarget` to Goal

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `Goal.periodUnit: string | null`, `Goal.periodTarget: number | null` on the Prisma Client type, available to every later task in this plan.

- [ ] **Step 1: Edit the Goal model**

In `prisma/schema.prisma`, change the `Goal` model's `periodicity`/`weeklyThreshold` lines to:

```prisma
model Goal {
  id              String     @id @default(cuid())
  userId          String
  user            User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  categoryId      String?
  category        Category?  @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  title           String
  description     String?
  type            String     // "boolean" | "quantitative"
  unit            String?
  targetValue     Float?
  periodicity     String     // "daily" | "weekly" | "count_per_period"
  weeklyThreshold Int?
  periodUnit      String?    // "week" | "month" — only set when periodicity = "count_per_period"
  periodTarget    Int?       // only set when periodicity = "count_per_period"
  archived        Boolean    @default(false)
  createdAt       DateTime   @default(now())
  entries         Entry[]
  milestones      Milestone[]
}
```

(Only `periodUnit`/`periodTarget` are new; the rest of the model is shown for context — do not otherwise change it.)

- [ ] **Step 2: Run the migration**

```bash
export PATH="/opt/homebrew/bin:$PATH"
npx prisma migrate dev --name add_count_per_period_fields
```

Expected: migration succeeds, two new nullable columns added to `Goal`, Prisma Client regenerated.

- [ ] **Step 3: Verify against the running database**

```bash
psql -d habit_tracker -c '\d "Goal"'
```

Expected: `periodUnit` and `periodTarget` columns present, both nullable.

Also apply the same migration to the isolated test database used by `npm test`:

```bash
npx prisma migrate deploy --schema prisma/schema.prisma
```

(Confirm `DATABASE_URL` in `.env.test` is picked up correctly — check how the project's existing test setup, e.g. `vitest.setup.ts`, points Prisma at `habit_tracker_test` before running this, or run this step with `DATABASE_URL` from `.env.test` explicitly exported if `migrate deploy` doesn't already read it.)

- [ ] **Step 4: Commit**

```bash
git add prisma
git commit -m "feat: add periodUnit and periodTarget fields to Goal"
```

---

### Task 2: Domain logic — `periodCount.ts`

**Files:**
- Create: `src/lib/domain/periodCount.ts`
- Test: `src/lib/domain/__tests__/periodCount.test.ts`

**Interfaces:**
- Consumes: `groupIntoWeeks`, `DayEntry` from `src/lib/domain/weeklyGoal.ts` (already exist).
- Produces:
  ```typescript
  type PeriodUnit = "week" | "month";
  function groupIntoCalendarPeriods(entries: DayEntry[], unit: PeriodUnit): DayEntry[][]
  function evaluatePeriod(period: DayEntry[], target: number): boolean
  function periodBounds(date: Date, unit: PeriodUnit): { start: Date; end: Date }
  ```
  `groupIntoCalendarPeriods`/`evaluatePeriod` are consumed by Task 5 (entries route). `periodBounds` is consumed by Task 4 (GET /api/goals periodProgress) to compute the current period's date range for a given UTC date.

- [ ] **Step 1: Write the failing tests**

`src/lib/domain/__tests__/periodCount.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { groupIntoCalendarPeriods, evaluatePeriod, periodBounds } from "../periodCount";

const day = (date: string, success: boolean) => ({ date, success });

describe("groupIntoCalendarPeriods", () => {
  it("groups by week when unit is week", () => {
    const entries = [
      day("2026-09-07", true), // Monday
      day("2026-09-08", true),
      day("2026-09-14", false), // next Monday
    ];
    const periods = groupIntoCalendarPeriods(entries, "week");
    expect(periods).toHaveLength(2);
    expect(periods[0]).toHaveLength(2);
    expect(periods[1]).toHaveLength(1);
  });

  it("groups by calendar month when unit is month", () => {
    const entries = [
      day("2026-09-01", true),
      day("2026-09-30", true),
      day("2026-10-01", false),
    ];
    const periods = groupIntoCalendarPeriods(entries, "month");
    expect(periods).toHaveLength(2);
    expect(periods[0]).toHaveLength(2);
    expect(periods[1]).toHaveLength(1);
  });

  it("returns an empty array for no entries", () => {
    expect(groupIntoCalendarPeriods([], "week")).toEqual([]);
    expect(groupIntoCalendarPeriods([], "month")).toEqual([]);
  });
});

describe("evaluatePeriod", () => {
  it("succeeds when successful days meet the target", () => {
    const period = [day("2026-09-01", true), day("2026-09-02", true), day("2026-09-03", false)];
    expect(evaluatePeriod(period, 2)).toBe(true);
    expect(evaluatePeriod(period, 3)).toBe(false);
  });
});

describe("periodBounds", () => {
  it("returns Monday-Sunday for a week unit", () => {
    // 2026-09-09 is a Wednesday
    const { start, end } = periodBounds(new Date("2026-09-09T00:00:00Z"), "week");
    expect(start.toISOString().slice(0, 10)).toBe("2026-09-07"); // Monday
    expect(end.toISOString().slice(0, 10)).toBe("2026-09-13"); // Sunday
  });

  it("returns the first-to-last day of the month for a month unit", () => {
    const { start, end } = periodBounds(new Date("2026-09-09T00:00:00Z"), "month");
    expect(start.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(end.toISOString().slice(0, 10)).toBe("2026-09-30");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/opt/homebrew/bin:$PATH" && npx vitest run src/lib/domain/__tests__/periodCount.test.ts`
Expected: FAIL — `../periodCount` module not found.

- [ ] **Step 3: Implement the domain logic**

`src/lib/domain/periodCount.ts`:

```typescript
import { groupIntoWeeks, DayEntry } from "./weeklyGoal";

export type PeriodUnit = "week" | "month";

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

export function groupIntoCalendarPeriods(entries: DayEntry[], unit: PeriodUnit): DayEntry[][] {
  if (unit === "week") {
    return groupIntoWeeks(entries);
  }
  const periods = new Map<string, DayEntry[]>();
  for (const entry of entries) {
    const key = monthKey(entry.date);
    if (!periods.has(key)) periods.set(key, []);
    periods.get(key)!.push(entry);
  }
  return Array.from(periods.keys())
    .sort()
    .map((key) => periods.get(key)!);
}

export function evaluatePeriod(period: DayEntry[], target: number): boolean {
  return period.filter((d) => d.success).length >= target;
}

export function periodBounds(date: Date, unit: PeriodUnit): { start: Date; end: Date } {
  if (unit === "month") {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    return { start, end };
  }
  const dayOfWeek = date.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  start.setUTCDate(start.getUTCDate() + diffToMonday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start, end };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/opt/homebrew/bin:$PATH" && npx vitest run src/lib/domain/__tests__/periodCount.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/periodCount.ts src/lib/domain/__tests__/periodCount.test.ts
git commit -m "feat: add count-per-period domain logic"
```

---

### Task 3: API validation — POST/PATCH `/api/goals`

**Files:**
- Modify: `src/app/api/goals/route.ts` (POST only — GET is Task 4)
- Modify: `src/app/api/goals/[id]/route.ts` (PATCH)
- Modify: `src/app/api/goals/route.test.ts`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `POST`/`PATCH /api/goals` accept `periodUnit`/`periodTarget` in the request body and persist them on `Goal`.

- [ ] **Step 1: Write the failing tests**

Add to `src/app/api/goals/route.test.ts` (inside the existing `describe("/api/goals", ...)` block, alongside the existing tests):

```typescript
  it("creates a count_per_period goal with periodUnit and periodTarget", async () => {
    const res = await POST(
      new Request("http://localhost/api/goals", {
        method: "POST",
        body: JSON.stringify({
          title: "3x pro Woche Fitness",
          type: "boolean",
          periodicity: "count_per_period",
          periodUnit: "week",
          periodTarget: 3,
        }),
      })
    );
    expect(res.status).toBe(201);
    const goal = await res.json();
    expect(goal.periodUnit).toBe("week");
    expect(goal.periodTarget).toBe(3);
  });

  it("rejects a count_per_period goal without periodUnit/periodTarget", async () => {
    const res = await POST(
      new Request("http://localhost/api/goals", {
        method: "POST",
        body: JSON.stringify({ title: "Bad goal", type: "boolean", periodicity: "count_per_period" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a count_per_period goal for a quantitative type", async () => {
    const res = await POST(
      new Request("http://localhost/api/goals", {
        method: "POST",
        body: JSON.stringify({
          title: "Bad goal",
          type: "quantitative",
          periodicity: "count_per_period",
          periodUnit: "week",
          periodTarget: 3,
          targetValue: 5,
        }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects an invalid periodUnit", async () => {
    const res = await POST(
      new Request("http://localhost/api/goals", {
        method: "POST",
        body: JSON.stringify({
          title: "Bad goal",
          type: "boolean",
          periodicity: "count_per_period",
          periodUnit: "day",
          periodTarget: 3,
        }),
      })
    );
    expect(res.status).toBe(400);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/opt/homebrew/bin:$PATH" && npx vitest run src/app/api/goals/route.test.ts`
Expected: FAIL — the new assertions fail because POST doesn't yet accept `periodicity: "count_per_period"` (falls into the existing `!["daily","weekly"].includes(periodicity)` 400 branch and none of the new fields are read).

- [ ] **Step 3: Update `src/app/api/goals/route.ts`'s POST handler**

Replace the existing POST function body with:

```typescript
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const body = await req.json();
  const {
    title,
    description,
    type,
    unit,
    targetValue,
    periodicity,
    weeklyThreshold,
    periodUnit,
    periodTarget,
    categoryId,
  } = body;

  if (
    !title ||
    !["boolean", "quantitative"].includes(type) ||
    !["daily", "weekly", "count_per_period"].includes(periodicity)
  ) {
    return NextResponse.json({ error: "title, valid type and periodicity are required." }, { status: 400 });
  }
  if (type === "quantitative" && (targetValue === undefined || targetValue === null)) {
    return NextResponse.json({ error: "targetValue is required for quantitative goals." }, { status: 400 });
  }
  if (periodicity === "weekly" && (weeklyThreshold === undefined || weeklyThreshold === null)) {
    return NextResponse.json({ error: "weeklyThreshold is required for weekly goals." }, { status: 400 });
  }
  if (periodicity === "count_per_period") {
    if (type !== "boolean") {
      return NextResponse.json({ error: "count_per_period is only available for boolean goals." }, { status: 400 });
    }
    if (!["week", "month"].includes(periodUnit)) {
      return NextResponse.json({ error: "periodUnit must be 'week' or 'month'." }, { status: 400 });
    }
    if (!Number.isInteger(periodTarget) || periodTarget < 1) {
      return NextResponse.json({ error: "periodTarget must be a positive integer." }, { status: 400 });
    }
  }
  // A category may only be referenced by its owner — otherwise another user's
  // category name/color would be echoed back through GET /api/goals.
  const normalizedCategoryId: string | null = categoryId ? String(categoryId) : null;
  if (normalizedCategoryId) {
    const category = await db.category.findFirst({ where: { id: normalizedCategoryId, userId } });
    if (!category) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }
  }

  const goal = await db.goal.create({
    data: {
      userId,
      title,
      description,
      type,
      unit,
      targetValue,
      periodicity,
      weeklyThreshold,
      periodUnit: periodicity === "count_per_period" ? periodUnit : undefined,
      periodTarget: periodicity === "count_per_period" ? periodTarget : undefined,
      categoryId: normalizedCategoryId,
    },
  });
  return NextResponse.json(goal, { status: 201 });
}
```

Leave the `GET` function in this file untouched here — it's modified in Task 4.

- [ ] **Step 4: Update `src/app/api/goals/[id]/route.ts`'s PATCH handler**

Replace the existing PATCH function body with:

```typescript
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const userId = (session.user as { id: string }).id;
  const existing = await db.goal.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const {
    title,
    description,
    type,
    unit,
    targetValue,
    periodicity,
    weeklyThreshold,
    periodUnit,
    periodTarget,
    categoryId,
    archived,
  } = body;

  if (periodicity === "count_per_period") {
    const effectiveType = type ?? existing.type;
    if (effectiveType !== "boolean") {
      return NextResponse.json({ error: "count_per_period is only available for boolean goals." }, { status: 400 });
    }
    if (!["week", "month"].includes(periodUnit)) {
      return NextResponse.json({ error: "periodUnit must be 'week' or 'month'." }, { status: 400 });
    }
    if (!Number.isInteger(periodTarget) || periodTarget < 1) {
      return NextResponse.json({ error: "periodTarget must be a positive integer." }, { status: 400 });
    }
  }

  // A category may only be referenced by its owner (cross-tenant data leak).
  // `undefined` leaves the category unchanged; `null`/"" clears it.
  const normalizedCategoryId =
    categoryId === undefined ? undefined : categoryId ? String(categoryId) : null;
  if (normalizedCategoryId) {
    const category = await db.category.findFirst({ where: { id: normalizedCategoryId, userId } });
    if (!category) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }
  }

  const goal = await db.goal.update({
    where: { id },
    data: {
      title,
      description,
      type,
      unit,
      targetValue,
      periodicity,
      weeklyThreshold,
      periodUnit,
      periodTarget,
      categoryId: normalizedCategoryId,
      archived,
    },
  });
  return NextResponse.json(goal);
}
```

Note: this only validates when the request explicitly sets `periodicity: "count_per_period"` — matching the global constraint that broader PATCH validation is out of scope for this plan.

- [ ] **Step 5: Run tests to verify they pass**

Run: `export PATH="/opt/homebrew/bin:$PATH" && npx vitest run src/app/api/goals/route.test.ts`
Expected: PASS (all tests in the file, including the 4 new ones).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/goals/route.ts src/app/api/goals/[id]/route.ts src/app/api/goals/route.test.ts
git commit -m "feat: validate count_per_period fields on goal create/update"
```

---

### Task 4: API — `GET /api/goals` period progress

**Files:**
- Modify: `src/app/api/goals/route.ts` (GET only)
- Modify: `src/app/api/goals/route.test.ts`

**Interfaces:**
- Consumes: `periodBounds` from `src/lib/domain/periodCount.ts` (Task 2).
- Produces: each goal object returned by `GET /api/goals` gains `periodProgress: { current: number; target: number } | null` — `null` for goals that aren't `count_per_period`.

- [ ] **Step 1: Write the failing test**

Add to `src/app/api/goals/route.test.ts`:

```typescript
  it("includes periodProgress for a count_per_period goal", async () => {
    const goal = await db.goal.create({
      data: { userId, title: "Fitness", type: "boolean", periodicity: "count_per_period", periodUnit: "week", periodTarget: 3 },
    });
    const today = new Date();
    const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7)); // this week's Monday
    await db.entry.create({ data: { goalId: goal.id, date: monday, done: true } });

    const res = await GET();
    const goals = await res.json();
    const found = goals.find((g: { id: string }) => g.id === goal.id);
    expect(found.periodProgress).toEqual({ current: 1, target: 3 });
  });

  it("returns periodProgress null for a non-count_per_period goal", async () => {
    await db.goal.create({ data: { userId, title: "Daily thing", type: "boolean", periodicity: "daily" } });
    const res = await GET();
    const goals = await res.json();
    expect(goals.every((g: { periodProgress: unknown }) => g.periodProgress === null || typeof g.periodProgress === "object")).toBe(true);
    const daily = goals.find((g: { title: string }) => g.title === "Daily thing");
    expect(daily.periodProgress).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/opt/homebrew/bin:$PATH" && npx vitest run src/app/api/goals/route.test.ts`
Expected: FAIL — `periodProgress` is `undefined`, not present on the response.

- [ ] **Step 3: Update `src/app/api/goals/route.ts`'s GET handler**

Replace the existing GET function with:

```typescript
import { periodBounds, PeriodUnit } from "@/lib/domain/periodCount";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const goals = await db.goal.findMany({
    where: { userId: (session.user as { id: string }).id, archived: false },
    include: { category: true },
    orderBy: { createdAt: "asc" },
  });

  // Today's entry per goal, so the dashboard can seed an already-checked-in
  // state. Entries are stored at UTC midnight, so "today" is the server's UTC
  // date — consistent with how entries are written (known timezone limitation).
  const today = utcToday();
  const todaysEntries = await db.entry.findMany({
    where: { goalId: { in: goals.map((g) => g.id) }, date: today },
  });
  const entryByGoal = new Map(todaysEntries.map((e) => [e.goalId, e]));

  const periodGoals = goals.filter((g) => g.periodicity === "count_per_period" && g.periodUnit && g.periodTarget != null);
  const periodProgressByGoal = new Map<string, { current: number; target: number }>();
  for (const goal of periodGoals) {
    const { start, end } = periodBounds(today, goal.periodUnit as PeriodUnit);
    const entries = await db.entry.findMany({
      where: { goalId: goal.id, date: { gte: start, lte: end } },
    });
    const current = entries.filter((e) =>
      goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity)
    ).length;
    periodProgressByGoal.set(goal.id, { current, target: goal.periodTarget as number });
  }

  return NextResponse.json(
    goals.map((goal) => {
      const entry = entryByGoal.get(goal.id);
      return {
        ...goal,
        todayEntry: entry ? { done: entry.done, value: entry.value } : null,
        periodProgress: periodProgressByGoal.get(goal.id) ?? null,
      };
    })
  );
}
```

Add the `periodBounds`/`PeriodUnit` import at the top of the file alongside the existing `utcToday` import.

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/opt/homebrew/bin:$PATH" && npx vitest run src/app/api/goals/route.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/goals/route.ts src/app/api/goals/route.test.ts
git commit -m "feat: expose current-period progress from GET /api/goals"
```

---

### Task 5: API — `POST /api/entries` count-per-period evaluation branch

**Files:**
- Modify: `src/app/api/entries/route.ts`
- Modify: `src/app/api/entries/route.test.ts`

**Interfaces:**
- Consumes: `groupIntoCalendarPeriods`, `evaluatePeriod`, `PeriodUnit` from `src/lib/domain/periodCount.ts` (Task 2).
- Produces: no interface change — `POST /api/entries`'s existing `{entry, newMilestones}` response shape is unchanged; this task only changes which evaluation path a `count_per_period` goal's entries take before reaching `determineNewMilestones`.

- [ ] **Step 1: Write the failing test**

Add to `src/app/api/entries/route.test.ts` (following the existing test file's setup pattern — check its `beforeEach` for how `userId`/goal creation is set up, and add a new goal specific to this test):

```typescript
  it("does not award a milestone before the period target is reached", async () => {
    const periodGoal = await db.goal.create({
      data: { userId, title: "3x pro Woche Fitness", type: "boolean", periodicity: "count_per_period", periodUnit: "week", periodTarget: 3 },
    });

    // 2026-09-07 is a Monday; both check-ins fall in the same calendar week.
    const make = (date: string) =>
      POST(new Request("http://localhost/api/entries", { method: "POST", body: JSON.stringify({ goalId: periodGoal.id, date, done: true }) }));

    await make("2026-09-07");
    const second = await make("2026-09-08");
    expect((await second.json()).newMilestones).toEqual([]);

    const totals = await db.entry.count({ where: { goalId: periodGoal.id } });
    expect(totals).toBe(2);
  });

  it("awards a 7-period streak milestone across 7 consecutive weekly periods, not 7 raw days", async () => {
    const periodGoal = await db.goal.create({
      data: { userId, title: "1x pro Woche", type: "boolean", periodicity: "count_per_period", periodUnit: "week", periodTarget: 1 },
    });

    // 7 Mondays, 7 days apart — one check-in per calendar week, 7 weeks running.
    const mondays = [
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
    ];
    let lastBody: { newMilestones: { type: string; threshold: number }[] } = { newMilestones: [] };
    for (const date of mondays) {
      const res = await POST(
        new Request("http://localhost/api/entries", { method: "POST", body: JSON.stringify({ goalId: periodGoal.id, date, done: true }) })
      );
      lastBody = await res.json();
    }

    // 7 consecutive successful weekly periods form a 7-period streak. Fed
    // through raw daily evaluation instead, these 7 isolated days (6 empty,
    // failed days between each of them) would never form a 7-long streak —
    // this is what proves the period-grouping branch is actually being used,
    // not just that entries are being recorded.
    expect(lastBody.newMilestones).toEqual([{ type: "streak", threshold: 7 }]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/opt/homebrew/bin:$PATH" && npx vitest run src/app/api/entries/route.test.ts`
Expected: FAIL on the second test — without this task's change, `count_per_period` goals fall through to the plain daily `dailyResults` evaluation path (only `periodicity === "weekly"` is special-cased today). With entries on 7 non-consecutive calendar days (one every 7th day), the densified daily array has 6 failed days between each success, so the current streak never exceeds 1 and `newMilestones` stays `[]` instead of the expected 7-period streak — a genuine, meaningful RED state (not a false negative).

- [ ] **Step 3: Add the third evaluation branch in `src/app/api/entries/route.ts`**

Add the import at the top:

```typescript
import { groupIntoCalendarPeriods, evaluatePeriod, PeriodUnit } from "@/lib/domain/periodCount";
```

Change the existing:

```typescript
  let evaluationResults: DailyResult[] = dailyResults;
  if (goal.periodicity === "weekly" && goal.weeklyThreshold != null) {
    const weeks = groupIntoWeeks(dailyResults.map((d) => ({ date: d.date, success: d.success })));
    evaluationResults = weeks.map((week) => ({
      date: week[0].date,
      success: evaluateWeek(week, goal.weeklyThreshold as number),
    }));
  }
```

to:

```typescript
  let evaluationResults: DailyResult[] = dailyResults;
  if (goal.periodicity === "weekly" && goal.weeklyThreshold != null) {
    const weeks = groupIntoWeeks(dailyResults.map((d) => ({ date: d.date, success: d.success })));
    evaluationResults = weeks.map((week) => ({
      date: week[0].date,
      success: evaluateWeek(week, goal.weeklyThreshold as number),
    }));
  } else if (goal.periodicity === "count_per_period" && goal.periodUnit != null && goal.periodTarget != null) {
    const periods = groupIntoCalendarPeriods(
      dailyResults.map((d) => ({ date: d.date, success: d.success })),
      goal.periodUnit as PeriodUnit
    );
    evaluationResults = periods.map((period) => ({
      date: period[0].date,
      success: evaluatePeriod(period, goal.periodTarget as number),
    }));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/opt/homebrew/bin:$PATH" && npx vitest run src/app/api/entries/route.test.ts`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/entries/route.ts src/app/api/entries/route.test.ts
git commit -m "feat: evaluate count_per_period goals over calendar periods in entries API"
```

---

### Task 6: UI — `GoalForm` count-per-period option

**Files:**
- Modify: `src/components/GoalForm.tsx`

**Interfaces:**
- Consumes: `POST /api/goals` (Task 3) with the new `periodUnit`/`periodTarget` fields.
- Produces: no new exports — this is a leaf UI component.

- [ ] **Step 1: Update state and submit payload**

In `src/components/GoalForm.tsx`, change:

```typescript
  const [periodicity, setPeriodicity] = useState<"daily" | "weekly">("daily");
```

to:

```typescript
  const [periodicity, setPeriodicity] = useState<"daily" | "weekly" | "count_per_period">("daily");
  const [periodUnit, setPeriodUnit] = useState<"week" | "month">("week");
  const [periodTarget, setPeriodTarget] = useState("");
```

Change the `type` setter's effect: when the user switches to `"quantitative"` while `periodicity` is `"count_per_period"`, reset periodicity to `"daily"` (since count_per_period is boolean-only). Add this effect below the existing `useEffect` that fetches categories:

```typescript
  useEffect(() => {
    if (type === "quantitative" && periodicity === "count_per_period") {
      setPeriodicity("daily");
    }
  }, [type, periodicity]);
```

Update the submit payload in `handleSubmit`'s `fetch` call — change:

```typescript
        weeklyThreshold: periodicity === "weekly" ? Number(weeklyThreshold) : undefined,
```

to:

```typescript
        weeklyThreshold: periodicity === "weekly" ? Number(weeklyThreshold) : undefined,
        periodUnit: periodicity === "count_per_period" ? periodUnit : undefined,
        periodTarget: periodicity === "count_per_period" ? Number(periodTarget) : undefined,
```

- [ ] **Step 2: Update the periodicity Select and add the new fields**

Change the periodicity `Select`'s `onValueChange` type cast and options:

```tsx
      <div className="space-y-2">
        <Label>Periodizität</Label>
        <Select value={periodicity} onValueChange={(v) => setPeriodicity(v as "daily" | "weekly" | "count_per_period")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Täglich</SelectItem>
            <SelectItem value="weekly">Wöchentlich</SelectItem>
            {type === "boolean" && <SelectItem value="count_per_period">X-mal pro Zeitraum</SelectItem>}
          </SelectContent>
        </Select>
      </div>
```

Add a new conditional block immediately after the existing `{periodicity === "weekly" && (...)}` block:

```tsx
      {periodicity === "count_per_period" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Zeitraum</Label>
            <Select value={periodUnit} onValueChange={(v) => setPeriodUnit(v as "week" | "month")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Woche</SelectItem>
                <SelectItem value="month">Monat</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="periodTarget">Wie oft?</Label>
            <Input id="periodTarget" type="number" min={1} value={periodTarget} onChange={(e) => setPeriodTarget(e.target.value)} required />
          </div>
        </div>
      )}
```

- [ ] **Step 3: Verify**

```bash
export PATH="/opt/homebrew/bin:$PATH"
npx tsc --noEmit
npm run lint
```

Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/GoalForm.tsx
git commit -m "feat: add count-per-period option to the goal creation form"
```

---

### Task 7: UI — `GoalCard` period progress display

**Files:**
- Modify: `src/components/GoalCard.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `periodProgress` field from `GET /api/goals` (Task 4).
- Produces: no new exports.

- [ ] **Step 1: Update the `Goal` interface and render the progress line**

In `src/components/GoalCard.tsx`, add to the `Goal` interface:

```typescript
interface Goal {
  id: string;
  title: string;
  type: "boolean" | "quantitative";
  unit: string | null;
  targetValue: number | null;
  category: { name: string; color: string } | null;
  todayEntry?: { done: boolean; value: number | null } | null;
  periodProgress?: { current: number; target: number } | null;
}
```

In the JSX, add the progress line under the title/category block. Change:

```tsx
      <div className="space-y-1">
        <Link href={`/goals/${goal.id}`} className="font-medium hover:underline">
          {goal.title}
        </Link>
        {goal.category && <CategoryBadge name={goal.category.name} color={goal.category.color} />}
      </div>
```

to:

```tsx
      <div className="space-y-1">
        <Link href={`/goals/${goal.id}`} className="font-medium hover:underline">
          {goal.title}
        </Link>
        {goal.category && <CategoryBadge name={goal.category.name} color={goal.category.color} />}
        {goal.periodProgress && (
          <p className="text-xs text-muted-foreground">
            {goal.periodProgress.current} von {goal.periodProgress.target} diese Periode
          </p>
        )}
      </div>
```

- [ ] **Step 2: Update `src/app/page.tsx`'s local `Goal` interface**

Add the same optional field to the `Goal` interface in `src/app/page.tsx`:

```typescript
interface Goal {
  id: string;
  title: string;
  type: "boolean" | "quantitative";
  unit: string | null;
  targetValue: number | null;
  category: { name: string; color: string } | null;
  todayEntry: { done: boolean; value: number | null } | null;
  periodProgress: { current: number; target: number } | null;
}
```

- [ ] **Step 3: Verify**

```bash
export PATH="/opt/homebrew/bin:$PATH"
npx tsc --noEmit
npm run lint
npm test
```

Expected: all clean, full suite passing.

- [ ] **Step 4: Manually verify the dev server boots**

```bash
npm run dev &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/goals/new
kill %1
```

Expected: `200`.

- [ ] **Step 5: Commit**

```bash
git add src/components/GoalCard.tsx src/app/page.tsx
git commit -m "feat: show current-period progress on the dashboard"
```

---

## Post-plan checklist (not a task — verify before calling this feature done)

- [ ] `npm test` passes (full suite, against the isolated test database)
- [ ] `npm run build` succeeds
- [ ] Manual walkthrough: create a boolean goal with periodicity "X-mal pro Zeitraum" (week, target 3) → check in on 3 different days within the same calendar week → dashboard shows "3 von 3 diese Periode" → confirm via `/goals/[id]` that the heatmap still shows individual days
