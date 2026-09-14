# Local Storage Migration — Phase 4: Export/Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add whole-database JSON export and import to the Dexie storage layer — the only backup/device-transfer mechanism now that there is no server account (spec §2, "Export/Import ist Teil des Umfangs, nicht optional").

**Architecture:** A single new `src/lib/storage/backup.ts` with `exportData()` (serializes all four tables) and `importData()` (validates and replaces all four tables). No domain-layer involvement — this is pure data movement, not derived-state computation.

**Tech Stack:** Same as Phases 1–3 (Dexie, `fake-indexeddb`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-14-local-storage-migration.md`

## Global Constraints

- All calendar-day dates stay `"YYYY-MM-DD"` strings — export/import moves records as-is, no date parsing needed here at all (carried over from Phases 1–3).
- Do not modify `src/lib/domain/*`, `src/app/api/**`, or any existing test (spec §5).
- **Import replaces all local data wholesale; it does not merge.** A merge would require resolving id collisions and re-deriving milestones/streaks against combined history — real complexity for a rare operation (restoring a backup or moving to a new device, both of which start from an empty or expendable local database). This is a deliberate scope decision for this phase, not an oversight: Phase 6 (UI wiring) must warn the user that importing discards current local data before calling `importData`, the same way the existing goal-delete confirmation warns before a destructive action.
- Import must validate the file's structure defensively before writing anything — this is user-provided file content crossing a trust boundary (a hand-edited or corrupted JSON file must not corrupt the database or crash later domain-logic reads that assume well-typed records).

---

### Task 1: `exportData`

**Files:**
- Create: `src/lib/storage/backup.ts`
- Test: `src/lib/storage/__tests__/backup.test.ts`

**Interfaces:**
- Consumes: `db`, `CategoryRecord`, `GoalRecord`, `EntryRecord`, `MilestoneRecord` from `./db`; `createCategory` from `./categories`, `createGoal` from `./goals` (tests only).
- Produces: `exportData(): Promise<ExportedData>` and the exported `ExportedData` type (`{ version: 1; exportedAt: string; categories: CategoryRecord[]; goals: GoalRecord[]; entries: EntryRecord[]; milestones: MilestoneRecord[] }`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/storage/__tests__/backup.test.ts`:

```ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { createCategory } from "../categories";
import { createGoal } from "../goals";
import { exportData } from "../backup";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/storage/__tests__/backup.test.ts`
Expected: FAIL with a module-not-found error for `../backup`.

- [ ] **Step 3: Write `src/lib/storage/backup.ts`**

```ts
import { db, type CategoryRecord, type GoalRecord, type EntryRecord, type MilestoneRecord } from "./db";

export interface ExportedData {
  version: 1;
  exportedAt: string;
  categories: CategoryRecord[];
  goals: GoalRecord[];
  entries: EntryRecord[];
  milestones: MilestoneRecord[];
}

export async function exportData(): Promise<ExportedData> {
  const [categories, goals, entries, milestones] = await Promise.all([
    db.categories.toArray(),
    db.goals.toArray(),
    db.entries.toArray(),
    db.milestones.toArray(),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    categories,
    goals,
    entries,
    milestones,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/storage/__tests__/backup.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/backup.ts src/lib/storage/__tests__/backup.test.ts
git commit -m "feat: add local backup export (whole-database JSON)"
```

---

### Task 2: `importData`

**Files:**
- Modify: `src/lib/storage/backup.ts`
- Modify: `src/lib/storage/__tests__/backup.test.ts`

**Interfaces:**
- Consumes: everything from Task 1.
- Produces: `importData(data: unknown): Promise<void>` — throws `Error("Invalid export file.")` for any structurally invalid input; otherwise atomically replaces all four tables' contents with the imported records.

- [ ] **Step 1: Write the failing test**

Add this import to `src/lib/storage/__tests__/backup.test.ts` (alongside the existing ones): `importData` from `../backup`. Then append:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/storage/__tests__/backup.test.ts`
Expected: FAIL with `importData is not a function`.

- [ ] **Step 3: Add `importData` to `src/lib/storage/backup.ts`**

Append to the file:

```ts
function isCategoryRecord(v: unknown): v is CategoryRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.name === "string" && typeof r.color === "string" && typeof r.icon === "string";
}

function isGoalRecord(v: unknown): v is GoalRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.title === "string" &&
    (r.type === "boolean" || r.type === "quantitative") &&
    (r.periodicity === "daily" || r.periodicity === "weekly" || r.periodicity === "count_per_period") &&
    typeof r.archived === "boolean" &&
    typeof r.createdAt === "string"
  );
}

function isEntryRecord(v: unknown): v is EntryRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.goalId === "string" && typeof r.date === "string" && typeof r.done === "boolean";
}

function isMilestoneRecord(v: unknown): v is MilestoneRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.goalId === "string" &&
    (r.type === "streak" || r.type === "total_count") &&
    typeof r.threshold === "number" &&
    typeof r.achievedAt === "string"
  );
}

function isValidExport(v: unknown): v is ExportedData {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  if (r.version !== 1) return false;
  if (!Array.isArray(r.categories) || !r.categories.every(isCategoryRecord)) return false;
  if (!Array.isArray(r.goals) || !r.goals.every(isGoalRecord)) return false;
  if (!Array.isArray(r.entries) || !r.entries.every(isEntryRecord)) return false;
  if (!Array.isArray(r.milestones) || !r.milestones.every(isMilestoneRecord)) return false;
  return true;
}

export async function importData(data: unknown): Promise<void> {
  if (!isValidExport(data)) {
    throw new Error("Invalid export file.");
  }

  await db.transaction("rw", db.categories, db.goals, db.entries, db.milestones, async () => {
    await db.categories.clear();
    await db.goals.clear();
    await db.entries.clear();
    await db.milestones.clear();
    await db.categories.bulkAdd(data.categories);
    await db.goals.bulkAdd(data.goals);
    await db.entries.bulkAdd(data.entries);
    await db.milestones.bulkAdd(data.milestones);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/storage/__tests__/backup.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Run the full test suite, typecheck, and lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: every test passes (Phases 1–3's 55 storage tests + this phase's 8 new ones + all 83 pre-existing tests = 146), no type errors, no lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/backup.ts src/lib/storage/__tests__/backup.test.ts
git commit -m "feat: add local backup import (validated whole-database replace)"
```

---

## Self-Review Notes

- **Spec coverage:** Spec §2 ("Export/Import (JSON) ist Teil des Umfangs, nicht optional") → Tasks 1–2 cover export and import completely. The replace-not-merge decision and its rationale are recorded in Global Constraints rather than left implicit, per the spec's own emphasis that this was a unanimous cross-analysis recommendation, not a minor detail.
- **Placeholder scan:** none — every step has runnable code and exact assertions.
- **Type consistency:** `ExportedData` (Task 1) is the exact shape `importData` (Task 2) validates against — `isValidExport`'s per-field checks match `CategoryRecord`/`GoalRecord`/`EntryRecord`/`MilestoneRecord` from `./db` (Phase 1) field-for-field, so a real `exportData()` output always round-trips through `importData()` without a validation false-negative (proven by Task 2's round-trip test).

## What Phase 6 needs from this phase (for the next plan document)

- `exportData()`/`importData()` are the two functions Phase 6's Settings-page "Daten" section calls directly — `exportData()`'s result gets `JSON.stringify`'d into a downloaded file, and a file the user selects gets `JSON.parse`'d and passed to `importData()`.
- Phase 6 must present a confirmation before calling `importData()` (it discards current local data — see Global Constraints above) and must catch and display `importData`'s `"Invalid export file."` error for a corrupted/unrelated file the user picks by mistake.
