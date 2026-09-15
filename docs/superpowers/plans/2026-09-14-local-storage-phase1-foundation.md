# Local Storage Migration — Phase 1: Foundation + Categories + Goals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Prisma/PostgreSQL persistence for Categories and Goals with a Dexie (IndexedDB) storage layer, laying the schema and helper foundation that later phases (Entries/Milestones, Stats/Week, Export/Import) build on. No UI is rewired yet — this phase only produces the new storage module with full test coverage.

**Architecture:** A new `src/lib/storage/` module owns a single Dexie database (`db.ts`) and one file per data domain (`categories.ts`, `goals.ts`), mirroring the responsibilities of the current `src/app/api/*/route.ts` files but running entirely in the browser. `src/lib/domain/*` stays untouched; this phase's repositories don't yet need it (streak/period logic arrives in Phase 2 once Entries exist).

**Tech Stack:** Dexie (IndexedDB wrapper), `fake-indexeddb` for testing in Vitest (no real browser needed), `crypto.randomUUID()` for IDs (no new dependency).

**Spec:** `docs/superpowers/specs/2026-09-14-local-storage-migration.md`

## Global Constraints

- All calendar-day dates are stored as `"YYYY-MM-DD"` strings, never `Date` objects (spec §3) — this matches `DailyResult.date: string` in `src/lib/domain/streak.ts` and avoids structured-clone conversion.
- IDs are generated with `crypto.randomUUID()`, not a new dependency (spec §3).
- Do not modify `src/app/api/**`, `prisma/`, `src/lib/db.ts`, `src/lib/auth.ts`, or any existing test in this phase — the old backend keeps working side by side until a later cleanup phase removes it (spec §5).
- Do not touch `vitest.setup.ts` or `vitest.config.ts` — new storage tests import `fake-indexeddb/auto` directly in each test file instead of relying on global config.

---

### Task 1: Dexie schema and database module

**Files:**
- Create: `src/lib/storage/db.ts`
- Create: `src/lib/storage/id.ts`
- Test: `src/lib/storage/__tests__/db.test.ts`

**Interfaces:**
- Produces: `db` (default Dexie instance with `categories`, `goals`, `entries`, `milestones` tables), `CategoryRecord`, `GoalRecord`, `EntryRecord`, `MilestoneRecord` types, `generateId(): string` from `id.ts`.

- [ ] **Step 1: Install dependencies**

Run: `npm install dexie dexie-react-hooks && npm install -D fake-indexeddb`

- [ ] **Step 2: Write the failing test**

Create `src/lib/storage/__tests__/db.test.ts`:

```ts
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
    await db.entries.add({ id: "e1", goalId: "g1", date: "2026-09-10", done: true, value: null });
    await db.entries.add({ id: "e2", goalId: "g1", date: "2026-09-11", done: false, value: null });
    await db.entries.add({ id: "e3", goalId: "g2", date: "2026-09-10", done: true, value: null });

    const found = await db.entries.where("[goalId+date]").equals(["g1", "2026-09-10"]).first();
    expect(found?.id).toBe("e1");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/storage/__tests__/db.test.ts`
Expected: FAIL with a module-not-found error for `../db` (file doesn't exist yet).

- [ ] **Step 4: Write `src/lib/storage/id.ts`**

```ts
/** Generates a unique id for a new local record. */
export function generateId(): string {
  return crypto.randomUUID();
}
```

- [ ] **Step 5: Write `src/lib/storage/db.ts`**

```ts
import Dexie, { type EntityTable } from "dexie";

export interface CategoryRecord {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export interface GoalRecord {
  id: string;
  categoryId: string | null;
  title: string;
  description: string | null;
  icon: string | null;
  /** "YYYY-MM-DD" or null for an ongoing goal. */
  endDate: string | null;
  type: "boolean" | "quantitative";
  unit: string | null;
  targetValue: number | null;
  step: number;
  periodicity: "daily" | "weekly" | "count_per_period";
  weeklyThreshold: number | null;
  periodUnit: "week" | "month" | null;
  periodTarget: number | null;
  archived: boolean;
  /** "YYYY-MM-DD" — the day the goal was created, UTC. */
  createdAt: string;
}

export interface EntryRecord {
  id: string;
  goalId: string;
  /** "YYYY-MM-DD", UTC calendar day. */
  date: string;
  done: boolean;
  value: number | null;
}

export interface MilestoneRecord {
  id: string;
  goalId: string;
  type: "streak" | "total_count";
  threshold: number;
  /** "YYYY-MM-DD". */
  achievedAt: string;
}

type RitualDb = Dexie & {
  categories: EntityTable<CategoryRecord, "id">;
  goals: EntityTable<GoalRecord, "id">;
  entries: EntityTable<EntryRecord, "id">;
  milestones: EntityTable<MilestoneRecord, "id">;
};

export const db = new Dexie("ritual") as RitualDb;

db.version(1).stores({
  categories: "id, name",
  goals: "id, archived, categoryId",
  entries: "id, goalId, date, [goalId+date]",
  milestones: "id, goalId, [goalId+type+threshold]",
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/storage/__tests__/db.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage/db.ts src/lib/storage/id.ts src/lib/storage/__tests__/db.test.ts package.json package-lock.json
git commit -m "feat: add Dexie storage foundation for local-only persistence"
```

---

### Task 2: Categories repository

**Files:**
- Create: `src/lib/storage/categories.ts`
- Test: `src/lib/storage/__tests__/categories.test.ts`

**Interfaces:**
- Consumes: `db`, `CategoryRecord` from `./db`; `generateId` from `./id`.
- Produces: `listCategories(): Promise<CategoryRecord[]>`, `createCategory(input: { name: string; color: string; icon: string }): Promise<CategoryRecord>` (throws `Error` on missing fields, mirroring `POST /api/categories`'s 400 case).

- [ ] **Step 1: Write the failing test**

Create `src/lib/storage/__tests__/categories.test.ts`:

```ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { createCategory, listCategories } from "../categories";

describe("categories storage", () => {
  beforeEach(async () => {
    await db.categories.clear();
  });

  it("creates a category and lists it", async () => {
    const created = await createCategory({ name: "Gesundheit", color: "#22c55e", icon: "heart" });
    expect(created.id).toBeTruthy();
    expect(created.name).toBe("Gesundheit");

    const all = await listCategories();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(created);
  });

  it("lists categories sorted by name", async () => {
    await createCategory({ name: "Sport", color: "#000", icon: "a" });
    await createCategory({ name: "Ernährung", color: "#111", icon: "b" });

    const all = await listCategories();
    expect(all.map((c) => c.name)).toEqual(["Ernährung", "Sport"]);
  });

  it("rejects a category missing required fields", async () => {
    await expect(createCategory({ name: "", color: "#000", icon: "a" })).rejects.toThrow(
      "name, color and icon are required."
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/storage/__tests__/categories.test.ts`
Expected: FAIL with a module-not-found error for `../categories`.

- [ ] **Step 3: Write `src/lib/storage/categories.ts`**

```ts
import { db, type CategoryRecord } from "./db";
import { generateId } from "./id";

export async function listCategories(): Promise<CategoryRecord[]> {
  return db.categories.orderBy("name").toArray();
}

export async function createCategory(input: {
  name: string;
  color: string;
  icon: string;
}): Promise<CategoryRecord> {
  if (!input.name || !input.color || !input.icon) {
    throw new Error("name, color and icon are required.");
  }
  const category: CategoryRecord = {
    id: generateId(),
    name: input.name,
    color: input.color,
    icon: input.icon,
  };
  await db.categories.add(category);
  return category;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/storage/__tests__/categories.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/categories.ts src/lib/storage/__tests__/categories.test.ts
git commit -m "feat: add local categories repository"
```

---

### Task 3: Goals repository — create and list

**Files:**
- Create: `src/lib/storage/goals.ts`
- Test: `src/lib/storage/__tests__/goals.test.ts`

**Interfaces:**
- Consumes: `db`, `GoalRecord` from `./db`; `generateId` from `./id`.
- Produces: `createGoal(input): Promise<GoalRecord>`, `listGoals(options?: { includeArchived?: boolean }): Promise<GoalRecord[]>`.

This mirrors the validation currently in `src/app/api/goals/route.ts`'s `POST` handler (title/type/periodicity required, `targetValue` required for `quantitative`, `step` must be positive if given, `weeklyThreshold` required for `weekly`, `periodUnit`/`periodTarget` required and validated for `count_per_period`, category must exist if given — ownership checks from the old multi-user code are dropped since there's only one implicit local "owner" now).

- [ ] **Step 1: Write the failing test**

Create `src/lib/storage/__tests__/goals.test.ts`:

```ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { createCategory } from "../categories";
import { createGoal, listGoals } from "../goals";

describe("goals storage", () => {
  beforeEach(async () => {
    await db.categories.clear();
    await db.goals.clear();
    await db.entries.clear();
  });

  it("creates a daily boolean goal with defaults", async () => {
    const goal = await createGoal({ title: "Keine Süßigkeiten", type: "boolean", periodicity: "daily" });
    expect(goal.id).toBeTruthy();
    expect(goal.title).toBe("Keine Süßigkeiten");
    expect(goal.type).toBe("boolean");
    expect(goal.periodicity).toBe("daily");
    expect(goal.archived).toBe(false);
    expect(goal.step).toBe(1);
    expect(goal.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("creates a quantitative goal with targetValue and unit", async () => {
    const goal = await createGoal({
      title: "3 Liter Wasser",
      type: "quantitative",
      unit: "Liter",
      targetValue: 3,
      periodicity: "daily",
    });
    expect(goal.targetValue).toBe(3);
    expect(goal.unit).toBe("Liter");
  });

  it("rejects a quantitative goal without targetValue", async () => {
    await expect(
      createGoal({ title: "Bad goal", type: "quantitative", periodicity: "daily" })
    ).rejects.toThrow("targetValue is required for quantitative goals.");
  });

  it("rejects a weekly goal without weeklyThreshold", async () => {
    await expect(
      createGoal({ title: "Bad goal", type: "boolean", periodicity: "weekly" })
    ).rejects.toThrow("weeklyThreshold is required for weekly goals.");
  });

  it("creates a count_per_period goal for a quantitative type", async () => {
    const goal = await createGoal({
      title: "3x pro Woche 10000 Schritte",
      type: "quantitative",
      unit: "Schritte",
      targetValue: 10000,
      periodicity: "count_per_period",
      periodUnit: "week",
      periodTarget: 3,
    });
    expect(goal.periodUnit).toBe("week");
    expect(goal.periodTarget).toBe(3);
  });

  it("rejects a count_per_period goal without a valid periodUnit", async () => {
    await expect(
      createGoal({ title: "Bad goal", type: "boolean", periodicity: "count_per_period", periodUnit: "day", periodTarget: 3 })
    ).rejects.toThrow("periodUnit must be 'week' or 'month'.");
  });

  it("rejects a categoryId that doesn't exist locally", async () => {
    await expect(
      createGoal({ title: "Bad goal", type: "boolean", periodicity: "daily", categoryId: "nonexistent" })
    ).rejects.toThrow("Invalid category.");
  });

  it("accepts a categoryId that exists locally", async () => {
    const category = await createCategory({ name: "Gesundheit", color: "#22c55e", icon: "heart" });
    const goal = await createGoal({ title: "Mit Kategorie", type: "boolean", periodicity: "daily", categoryId: category.id });
    expect(goal.categoryId).toBe(category.id);
  });

  it("lists only non-archived goals by default", async () => {
    const active = await createGoal({ title: "Aktiv", type: "boolean", periodicity: "daily" });
    const archived = await createGoal({ title: "Archiviert", type: "boolean", periodicity: "daily" });
    await db.goals.update(archived.id, { archived: true });

    const goals = await listGoals();
    expect(goals.map((g) => g.id)).toEqual([active.id]);
  });

  it("includes archived goals when includeArchived is true", async () => {
    const goal = await createGoal({ title: "Archiviert", type: "boolean", periodicity: "daily" });
    await db.goals.update(goal.id, { archived: true });

    const goals = await listGoals({ includeArchived: true });
    expect(goals.map((g) => g.id)).toEqual([goal.id]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/storage/__tests__/goals.test.ts`
Expected: FAIL with a module-not-found error for `../goals`.

- [ ] **Step 3: Write `src/lib/storage/goals.ts`**

```ts
import { db, type GoalRecord } from "./db";
import { generateId } from "./id";

function utcTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface CreateGoalInput {
  title: string;
  description?: string;
  icon?: string | null;
  type: "boolean" | "quantitative";
  unit?: string;
  targetValue?: number;
  step?: number;
  periodicity: "daily" | "weekly" | "count_per_period";
  weeklyThreshold?: number;
  periodUnit?: "week" | "month";
  periodTarget?: number;
  categoryId?: string | null;
  endDate?: string | null;
}

export async function createGoal(input: CreateGoalInput): Promise<GoalRecord> {
  if (!input.title || !["boolean", "quantitative"].includes(input.type)) {
    throw new Error("title and a valid type are required.");
  }
  if (!["daily", "weekly", "count_per_period"].includes(input.periodicity)) {
    throw new Error("a valid periodicity is required.");
  }
  if (input.type === "quantitative" && (input.targetValue === undefined || input.targetValue === null)) {
    throw new Error("targetValue is required for quantitative goals.");
  }
  if (input.step !== undefined && !(input.step > 0)) {
    throw new Error("step must be a positive number.");
  }
  if (input.periodicity === "weekly" && (input.weeklyThreshold === undefined || input.weeklyThreshold === null)) {
    throw new Error("weeklyThreshold is required for weekly goals.");
  }
  if (input.periodicity === "count_per_period") {
    if (!["week", "month"].includes(input.periodUnit ?? "")) {
      throw new Error("periodUnit must be 'week' or 'month'.");
    }
    if (!Number.isInteger(input.periodTarget) || (input.periodTarget as number) < 1) {
      throw new Error("periodTarget must be a positive integer.");
    }
  }
  if (input.categoryId) {
    const category = await db.categories.get(input.categoryId);
    if (!category) throw new Error("Invalid category.");
  }

  const goal: GoalRecord = {
    id: generateId(),
    categoryId: input.categoryId ?? null,
    title: input.title,
    description: input.description ?? null,
    icon: input.icon ?? null,
    endDate: input.endDate ?? null,
    type: input.type,
    unit: input.type === "quantitative" ? (input.unit ?? null) : null,
    targetValue: input.type === "quantitative" ? (input.targetValue as number) : null,
    step: input.type === "quantitative" ? (input.step ?? 1) : 1,
    periodicity: input.periodicity,
    weeklyThreshold: input.periodicity === "weekly" ? (input.weeklyThreshold as number) : null,
    periodUnit: input.periodicity === "count_per_period" ? (input.periodUnit as "week" | "month") : null,
    periodTarget: input.periodicity === "count_per_period" ? (input.periodTarget as number) : null,
    archived: false,
    createdAt: utcTodayString(),
  };
  await db.goals.add(goal);
  return goal;
}

export async function listGoals(options?: { includeArchived?: boolean }): Promise<GoalRecord[]> {
  const all = await db.goals.orderBy("createdAt").toArray();
  return options?.includeArchived ? all : all.filter((g) => !g.archived);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/storage/__tests__/goals.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/goals.ts src/lib/storage/__tests__/goals.test.ts
git commit -m "feat: add local goals repository (create, list)"
```

---

### Task 4: Goals repository — update and delete

**Files:**
- Modify: `src/lib/storage/goals.ts`
- Modify: `src/lib/storage/__tests__/goals.test.ts`

**Interfaces:**
- Consumes: everything from Task 3.
- Produces: `updateGoal(id: string, patch: Partial<CreateGoalInput> & { archived?: boolean }): Promise<GoalRecord>`, `deleteGoal(id: string): Promise<void>` (throws if the goal has entries, mirroring `DELETE /api/goals/[id]`'s 409 case).

This mirrors `PATCH /api/goals/[id]` and `DELETE /api/goals/[id]`: a `count_per_period` patch still validates `periodUnit`/`periodTarget`, and a goal with existing entries can only be archived, never hard-deleted.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/storage/__tests__/goals.test.ts` (add these `it` blocks inside the existing `describe("goals storage", ...)` block, and add `updateGoal, deleteGoal` to the import from `../goals`):

```ts
  it("updates a goal's title", async () => {
    const goal = await createGoal({ title: "Alt", type: "boolean", periodicity: "daily" });
    const updated = await updateGoal(goal.id, { title: "Neu" });
    expect(updated.title).toBe("Neu");
  });

  it("switches a goal to count_per_period and validates periodUnit/periodTarget", async () => {
    const goal = await createGoal({ title: "Fitness", type: "boolean", periodicity: "daily" });
    const updated = await updateGoal(goal.id, { periodicity: "count_per_period", periodUnit: "week", periodTarget: 3 });
    expect(updated.periodicity).toBe("count_per_period");
    expect(updated.periodTarget).toBe(3);
  });

  it("rejects an update to count_per_period with an invalid periodUnit", async () => {
    const goal = await createGoal({ title: "Fitness", type: "boolean", periodicity: "daily" });
    await expect(
      updateGoal(goal.id, { periodicity: "count_per_period", periodUnit: "day", periodTarget: 3 })
    ).rejects.toThrow("periodUnit must be 'week' or 'month'.");
  });

  it("archives a goal via the archived flag", async () => {
    const goal = await createGoal({ title: "Sport", type: "boolean", periodicity: "daily" });
    const updated = await updateGoal(goal.id, { archived: true });
    expect(updated.archived).toBe(true);
  });

  it("deletes a goal with no entries", async () => {
    const goal = await createGoal({ title: "Ohne Einträge", type: "boolean", periodicity: "daily" });
    await deleteGoal(goal.id);
    expect(await db.goals.get(goal.id)).toBeUndefined();
  });

  it("refuses to delete a goal that has entries", async () => {
    const goal = await createGoal({ title: "Mit Einträgen", type: "boolean", periodicity: "daily" });
    await db.entries.add({ id: "e1", goalId: goal.id, date: "2026-09-10", done: true, value: null });
    await expect(deleteGoal(goal.id)).rejects.toThrow("Goal has entries; archive it instead of deleting.");
    expect(await db.goals.get(goal.id)).toBeDefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/storage/__tests__/goals.test.ts`
Expected: FAIL with `updateGoal is not a function` / `deleteGoal is not a function`.

- [ ] **Step 3: Add `updateGoal` and `deleteGoal` to `src/lib/storage/goals.ts`**

Append to the file (after `listGoals`):

```ts
export async function updateGoal(
  id: string,
  patch: Partial<CreateGoalInput> & { archived?: boolean }
): Promise<GoalRecord> {
  const existing = await db.goals.get(id);
  if (!existing) throw new Error("Not found");

  if (patch.step !== undefined && !(patch.step > 0)) {
    throw new Error("step must be a positive number.");
  }
  const effectivePeriodicity = patch.periodicity ?? existing.periodicity;
  if (effectivePeriodicity === "count_per_period") {
    const periodUnit = patch.periodUnit ?? existing.periodUnit;
    const periodTarget = patch.periodTarget ?? existing.periodTarget;
    if (!["week", "month"].includes(periodUnit ?? "")) {
      throw new Error("periodUnit must be 'week' or 'month'.");
    }
    if (!Number.isInteger(periodTarget) || (periodTarget as number) < 1) {
      throw new Error("periodTarget must be a positive integer.");
    }
  }
  if (patch.categoryId) {
    const category = await db.categories.get(patch.categoryId);
    if (!category) throw new Error("Invalid category.");
  }

  const changes: Partial<GoalRecord> = { ...patch } as Partial<GoalRecord>;
  await db.goals.update(id, changes);
  return (await db.goals.get(id)) as GoalRecord;
}

export async function deleteGoal(id: string): Promise<void> {
  const entryCount = await db.entries.where("goalId").equals(id).count();
  if (entryCount > 0) {
    throw new Error("Goal has entries; archive it instead of deleting.");
  }
  await db.goals.delete(id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/storage/__tests__/goals.test.ts`
Expected: PASS (15 tests)

- [ ] **Step 5: Run the full test suite to confirm no regressions in the existing (still-active) backend**

Run: `npm test`
Expected: PASS — the new `src/lib/storage/**` tests pass alongside every existing `route.test.ts`/domain test, which are untouched by this phase.

- [ ] **Step 6: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage/goals.ts src/lib/storage/__tests__/goals.test.ts
git commit -m "feat: add local goals repository (update, delete)"
```

---

## Self-Review Notes

- **Spec coverage:** Spec §3 (data model, string dates, `crypto.randomUUID()`) → Task 1. Spec §4 (storage module structure, domain layer untouched) → all tasks. Spec §5 Phase 1 scope ("Foundation + Categories + Goals ... ohne abgeleitete Felder") → Tasks 1–4 exactly; `todayEntry`/`periodProgress`/`currentStreak` on `listGoals` are explicitly deferred to Phase 2 per the spec, not silently dropped.
- **Placeholder scan:** none — every step has runnable code and exact assertions.
- **Type consistency:** `GoalRecord`/`CategoryRecord` (Task 1) are the types every later task imports; `CreateGoalInput` (Task 3) is reused unchanged by `updateGoal`'s `Partial<CreateGoalInput>` (Task 4). Function names (`listCategories`, `createCategory`, `createGoal`, `listGoals`, `updateGoal`, `deleteGoal`) are the exact names Phase 2's plan will import.

## What Phase 2 needs from this phase (for the next plan document)

- `db.entries` and `db.milestones` tables already exist (Task 1) so Phase 2 only adds repository files, not schema changes.
- `listGoals()` returns raw `GoalRecord[]`; Phase 2 will likely add a separate `listGoalsWithProgress()` (or extend `listGoals`) once entries exist — that's a Phase 2 decision, not pre-empted here.
- `deleteGoal`'s entry-count check already reads `db.entries`, proving the two tables compose correctly ahead of Phase 2.
