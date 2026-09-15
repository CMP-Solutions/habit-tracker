# Local Storage Migration — Phase 6a: UI Wiring — Core Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewire the daily-use core loop — Dashboard ("Heute"), Woche, and goal create/edit/detail — from `fetch("/api/...")` calls against the Prisma backend to the Dexie `storage/*` functions built in Phases 1–5. After this phase, a user can create goals, check them off, edit/archive/delete them, and see their history entirely without the server backend, on these pages specifically.

**Architecture:** No new files. Every change is a page or component swapping its data-fetching calls for direct `storage/*` function calls — no more `fetch`, no more `res.json()`, no more HTTP status checking (a thrown `Error` from a `storage/*` function replaces a non-2xx response). Phase 6b (not yet planned) covers Auswertung, Meilensteine, Settings, and removing the auth surface (NavBar's Abmelden, `/login`, `/register`, `src/middleware.ts`) — both backends coexist safely until then, since these are different pages.

**Tech Stack:** No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-14-local-storage-migration.md`

## Global Constraints

- Do not modify `src/lib/domain/*`, `src/app/api/**`, `src/middleware.ts`, `src/app/login/**`, `src/app/register/**`, `src/components/NavBar.tsx`, `src/app/settings/**`, `src/app/stats/**`, or `src/app/milestones/**` — those belong to Phase 6b or Phase 7.
- This codebase has no existing unit or component tests for pages or components (`GoalCard.tsx`, `page.tsx`, etc. have never had a `.test.tsx` file) — verification for this phase is the project's own established method for UI changes: run the dev server, use Playwright to exercise the real flow, and view screenshots at 1440px and 390px, per this project's "UI nie als fertig melden ohne Screenshots beider Breiten selbst angesehen zu haben" rule. Do not invent component tests that didn't exist before; do keep running `npm test`/`npx tsc --noEmit`/`npm run lint` after every task, since the `storage/*` layer they now call is unit-tested.
- A thrown `Error` from a `storage/*` function is the only failure signal now (no more HTTP status codes) — every rewired page must catch it and show `err.message` (or a German fallback string) the same way the old code showed the JSON body's `error` field.

---

### Task 1: Fix `listGoalsWithProgress` — include the joined category

**Files:**
- Modify: `src/lib/storage/goals.ts`
- Modify: `src/lib/storage/__tests__/goals.test.ts`

**Interfaces:**
- Modifies: `GoalWithProgress` (Phase 2) gains a `category: { name: string; color: string } | null` field; `listGoalsWithProgress()`'s return shape changes accordingly.

The original `GET /api/goals` route used Prisma's `include: { category: true }`, so every goal in its response carried its category. Phase 2's port of this route missed that join entirely — `GoalCard.tsx` (Task 3 below) needs `goal.category.name`/`.color` for its badge and left-border accent color, so this must be fixed before the Dashboard can be wired.

- [ ] **Step 1: Write the failing test**

Add this import to `src/lib/storage/__tests__/goals.test.ts` (alongside the existing ones): `createCategory` from `../categories` (it is likely already imported — check before adding a duplicate). Then add these `it` blocks after the existing `listGoalsWithProgress` tests:

```ts
  it("includes the goal's category as { name, color } when it has one", async () => {
    const category = await createCategory({ name: "Gesundheit", color: "#22c55e", icon: "heart" });
    const goal = await createGoal({ title: "Wasser trinken", type: "boolean", periodicity: "daily", categoryId: category.id });

    const goals = await listGoalsWithProgress();
    expect(goals.find((g) => g.id === goal.id)?.category).toEqual({ name: "Gesundheit", color: "#22c55e" });
  });

  it("returns null category for a goal without one", async () => {
    const goal = await createGoal({ title: "Ohne Kategorie", type: "boolean", periodicity: "daily" });
    const goals = await listGoalsWithProgress();
    expect(goals.find((g) => g.id === goal.id)?.category).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/storage/__tests__/goals.test.ts`
Expected: FAIL — `category` is `undefined`, not `{ name, color }` or `null`.

- [ ] **Step 3: Fix `listGoalsWithProgress` in `src/lib/storage/goals.ts`**

Change the `GoalWithProgress` interface:

```ts
export interface GoalWithProgress extends GoalRecord {
  category: { name: string; color: string } | null;
  todayEntry: { done: boolean; value: number | null } | null;
  periodProgress: { current: number; target: number } | null;
  currentStreak: number;
}
```

Inside `listGoalsWithProgress`, after the `const goals = allGoals.filter(...)` line, add:

```ts
  const categories = await db.categories.toArray();
  const categoryById = new Map(categories.map((c) => [c.id, c]));
```

Then change the function's final `return goals.map(...)` block to include `category`:

```ts
  return goals.map((goal) => {
    const entry = entryByGoal.get(goal.id);
    const category = goal.categoryId ? categoryById.get(goal.categoryId) : undefined;
    return {
      ...goal,
      category: category ? { name: category.name, color: category.color } : null,
      todayEntry: entry ? { done: entry.done, value: entry.value } : null,
      periodProgress: periodProgressByGoal.get(goal.id) ?? null,
      currentStreak: streakByGoal.get(goal.id) ?? 0,
    };
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/storage/__tests__/goals.test.ts`
Expected: PASS (25 tests — 23 from Phases 2–3 plus these 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/goals.ts src/lib/storage/__tests__/goals.test.ts
git commit -m "fix: include joined category in listGoalsWithProgress (missed in Phase 2)"
```

---

### Task 2: Wire the Dashboard ("Heute")

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `listGoalsWithProgress`, `type GoalWithProgress` from `@/lib/storage/goals`; `createGoal` from `@/lib/storage/goals`; `countOpenGoals`, `maybeShowReminder` from `@/lib/reminders`.

- [ ] **Step 1: Replace the data layer in `src/app/page.tsx`**

Replace the `Goal` interface and the `load`/`useEffect`/`addTemplate` block:

```ts
import { listGoalsWithProgress, createGoal, type GoalWithProgress } from "@/lib/storage/goals";
import { countOpenGoals, maybeShowReminder } from "@/lib/reminders";
```

(add these alongside the existing imports; remove the now-unused local `Goal` interface — `GoalWithProgress` replaces it everywhere `Goal` was used, including the `useState<Goal[]>` and `completionRatio(goal: Goal)` signature)

```ts
  const [goals, setGoals] = useState<GoalWithProgress[]>([]);
  const today = new Date();

  const load = useCallback(async () => {
    const data = await listGoalsWithProgress();
    setGoals(data);
    maybeShowReminder(countOpenGoals(data));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addTemplate(template: (typeof GOAL_TEMPLATES)[number]) {
    await createGoal(template);
    load();
  }
```

- [ ] **Step 2: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (`completionRatio`'s parameter type annotation `goal: Goal` must be changed to `goal: GoalWithProgress` if it doesn't already infer correctly — check the diagnostic and fix if needed.)

- [ ] **Step 3: Verify in the browser with Playwright**

Start the dev server (`npm run dev`), navigate to `/`. Confirm: goals load without any network request to `/api/goals` (check the Network tab or `browser_network_requests`); creating a goal from a template works and appears immediately; checking a goal's box updates the dashboard. Screenshot at 1440px and 390px.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: wire Dashboard to local storage (listGoalsWithProgress, createGoal, reminders)"
```

---

### Task 3: Wire `GoalCard`

**Files:**
- Modify: `src/components/GoalCard.tsx`

**Interfaces:**
- Consumes: `recordEntry` from `@/lib/storage/entries`.
- Modifies: the local `Goal` interface in this file gains `category: { name: string; color: string } | null` typed as non-optional to match `GoalWithProgress` (it was already declared, just confirm it isn't marked optional in a way that conflicts) — no structural change needed since `GoalWithProgress` already carries exactly this shape after Task 1.

- [ ] **Step 1: Replace `checkIn` in `src/components/GoalCard.tsx`**

Add the import: `import { recordEntry } from "@/lib/storage/entries";` (remove `todayLocalDate` import only if nothing else in the file uses it — it's still used to compute `today`, so keep it).

Replace the `checkIn` function:

```ts
  async function checkIn(newDone: boolean, newValue?: number) {
    const today = todayLocalDate();
    await recordEntry({ goalId: goal.id, date: today, done: newDone, value: newValue });
    onChecked();
  }
```

- [ ] **Step 2: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Verify in the browser with Playwright**

On `/`, check a boolean goal's box and confirm the checkmark, celebration confetti, and streak flame still work exactly as before; for a quantitative goal, type a value at/above target and confirm the same. Confirm no request to `/api/entries` appears in the network log.

- [ ] **Step 4: Commit**

```bash
git add src/components/GoalCard.tsx
git commit -m "feat: wire GoalCard to local storage (recordEntry)"
```

---

### Task 4: Wire the Woche page

**Files:**
- Modify: `src/app/woche/page.tsx`

**Interfaces:**
- Consumes: `getWeek`, `type WeekResponse` — Phase 3's `week.ts` exports this type as `WeekResult`; the page's own local `WeekResponse`/`WeekGoal`/`WeekEntry` interfaces can be deleted and replaced by `WeekResult`/`WeekGoal`/`WeekEntry` imported from `@/lib/storage/week` (Phase 3 deliberately matched these names and shapes for exactly this swap). `recordEntry` from `@/lib/storage/entries`.

- [ ] **Step 1: Replace the data layer in `src/app/woche/page.tsx`**

Remove the local `interface WeekEntry`, `interface WeekGoal`, `interface WeekResponse` — replace every use of `WeekResponse` with `WeekResult`, imported:

```ts
import { getWeek, type WeekResult } from "@/lib/storage/week";
import { recordEntry } from "@/lib/storage/entries";
```

Change `useState<WeekResponse | null>` to `useState<WeekResult | null>`. Replace the `load` callback and the mount `useEffect`:

```ts
  const load = useCallback(async () => {
    setData(await getWeek());
  }, []);

  useEffect(() => {
    load();
  }, [load]);
```

(add `useCallback` to the existing `"use client"` file's React import if not already imported)

Replace `saveEntry`:

```ts
  async function saveEntry(goalId: string, date: string, done: boolean, value?: number) {
    await recordEntry({ goalId, date, done, value });
    load();
  }
```

- [ ] **Step 2: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Verify in the browser with Playwright**

Navigate to `/woche`. Confirm the 7-day grid renders with the same data as before, category colors and icons show correctly, checking a box or typing a quantitative value in any day column saves and updates. Confirm no request to `/api/week` or `/api/entries`. Screenshot at 1440px and 390px (this page's sticky-column behavior from an earlier fix must still work correctly on mobile).

- [ ] **Step 4: Commit**

```bash
git add src/app/woche/page.tsx
git commit -m "feat: wire Woche page to local storage (getWeek, recordEntry)"
```

---

### Task 5: Wire `GoalForm`

**Files:**
- Modify: `src/components/GoalForm.tsx`

**Interfaces:**
- Consumes: `listCategories` from `@/lib/storage/categories`; `createGoal`, `updateGoal` from `@/lib/storage/goals`.

- [ ] **Step 1: Replace the categories fetch and the submit handler in `src/components/GoalForm.tsx`**

Add imports: `import { listCategories } from "@/lib/storage/categories";` and `import { createGoal, updateGoal } from "@/lib/storage/goals";`.

Replace the categories-loading effect:

```ts
  useEffect(() => {
    listCategories().then(setCategories);
  }, []);
```

Replace `handleSubmit`:

```ts
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = {
      title,
      icon,
      type,
      periodicity,
      unit: type === "quantitative" ? unit : undefined,
      targetValue: type === "quantitative" ? Number(targetValue) : undefined,
      step: type === "quantitative" ? Number(step) : undefined,
      weeklyThreshold: periodicity === "weekly" ? Number(weeklyThreshold) : undefined,
      periodUnit: periodicity === "count_per_period" ? periodUnit : undefined,
      periodTarget: periodicity === "count_per_period" ? Number(periodTarget) : undefined,
      categoryId,
      endDate: duration === "ends" ? endDate : null,
    };
    try {
      if (existingGoal) {
        await updateGoal(existingGoal.id, input);
        router.push(`/goals/${existingGoal.id}`);
      } else {
        await createGoal(input);
        router.push("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
    }
  }
```

- [ ] **Step 2: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (`createGoal`'s `CreateGoalInput` and `updateGoal`'s `Partial<CreateGoalInput> & { archived?: boolean }` must structurally accept `input` as written — `periodUnit`/`weeklyThreshold`/etc. being `undefined` for the non-matching periodicity is already how `CreateGoalInput`'s optional fields are declared, so this should type-check without casts.)

- [ ] **Step 3: Verify in the browser with Playwright**

On `/goals/new`, create a boolean goal, a quantitative goal, a weekly goal, and a `count_per_period` goal (both boolean and quantitative type) — confirm each saves and redirects to `/`. On an existing goal's `/goals/[id]/edit`, change the title and save — confirm it redirects to `/goals/[id]` with the new title. Trigger a validation error (e.g. submit a quantitative goal with no target — though the `required` HTML attribute may block this client-side; if so, confirm the equivalent server-side rejection message would show by temporarily testing with devtools, or skip if unreachable through the UI) and confirm the error message renders in German.

- [ ] **Step 4: Commit**

```bash
git add src/components/GoalForm.tsx
git commit -m "feat: wire GoalForm to local storage (listCategories, createGoal, updateGoal)"
```

---

### Task 6: Wire the goal detail page

**Files:**
- Modify: `src/app/goals/[id]/page.tsx`

**Interfaces:**
- Consumes: `getGoalHistory` from `@/lib/storage/goals` (its return type `GoalHistory` structurally satisfies this page's existing local `HistoryResponse` interface — see Task notes).

- [ ] **Step 1: Replace the data layer in `src/app/goals/[id]/page.tsx`**

Remove the local `interface HistoryResponse` — replace `useState<HistoryResponse | null>` with `useState<GoalHistory | null>`, importing the type:

```ts
import { getGoalHistory, type GoalHistory } from "@/lib/storage/goals";
```

Replace the `useEffect`:

```ts
  useEffect(() => {
    getGoalHistory(params.id)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Ziel nicht gefunden."));
  }, [params.id]);
```

- [ ] **Step 2: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (`GoalHistory.milestones` items carry an extra `id` field the page's JSX doesn't read — harmless; the page's `m.type`/`m.threshold` accesses still work since `GoalHistory.milestones` items have those fields too.)

- [ ] **Step 3: Verify in the browser with Playwright**

Navigate to a goal's detail page (`/goals/[id]`). Confirm streak stats, heatmap, trend chart, and milestone list render identically to before. Screenshot at 1440px and 390px.

- [ ] **Step 4: Commit**

```bash
git add "src/app/goals/[id]/page.tsx"
git commit -m "feat: wire goal detail page to local storage (getGoalHistory)"
```

---

### Task 7: Wire the goal edit page

**Files:**
- Modify: `src/app/goals/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `getGoalHistory`, `updateGoal`, `deleteGoal` from `@/lib/storage/goals`.

- [ ] **Step 1: Replace the data layer in `src/app/goals/[id]/edit/page.tsx`**

Add the import: `import { getGoalHistory, updateGoal, deleteGoal } from "@/lib/storage/goals";`

Replace the `useEffect`:

```ts
  useEffect(() => {
    getGoalHistory(params.id)
      .then((data) => {
        setGoal(data.goal);
        setEntryCount(data.entryCount);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Ziel nicht gefunden."));
  }, [params.id]);
```

Replace `handleConfirm`:

```ts
  async function handleConfirm() {
    setDeleteError(null);
    try {
      if (willArchive) {
        await updateGoal(params.id, { archived: true });
      } else {
        await deleteGoal(params.id);
      }
      router.push("/");
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : willArchive ? "Archivieren fehlgeschlagen." : "Löschen fehlgeschlagen."
      );
    }
  }
```

- [ ] **Step 2: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (`setGoal(data.goal)` must accept a `GoalRecord` where an `ExistingGoal` is expected — `GoalRecord` structurally satisfies `ExistingGoal`'s fields, so this should type-check without a cast; if it doesn't, narrow with an explicit object literal picking only `ExistingGoal`'s fields instead of casting.)

- [ ] **Step 3: Verify in the browser with Playwright**

On `/goals/[id]/edit` for a goal with entries, click "Löschen" and confirm the dialog shows "Ziel archivieren?" with the correct entry count, "Abbrechen" has focus, and confirming archives and redirects to `/`. Create a fresh goal with zero entries, go to its edit page, confirm the dialog instead shows "Ziel wirklich löschen?" and confirming hard-deletes it. Screenshot both dialog states.

- [ ] **Step 4: Run the full test suite one more time**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all tests pass (unchanged count from Task 1's 25 goals tests plus everything else — this phase added no new automated tests beyond Task 1's fix), no type errors, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/goals/[id]/edit/page.tsx"
git commit -m "feat: wire goal edit page to local storage (getGoalHistory, updateGoal, deleteGoal)"
```

---

## Self-Review Notes

- **Spec coverage:** Spec §5 Phase 6's core-loop portion ("jede Seite von fetch(\"/api/...\") auf die neuen storage/*-Funktionen umstellen") → Tasks 2–7 cover Dashboard, GoalCard, Woche, GoalForm, goal detail, and goal edit — the complete daily-use path. Task 1 is a bug fix surfaced by this wiring work, not spec drift.
- **Placeholder scan:** none — every step has runnable code. Playwright verification steps describe manual actions rather than code, which is correct for this codebase's established UI-verification method (no prior page/component test precedent), not a placeholder for automated tests that should exist but don't.
- **Type consistency:** `GoalWithProgress` (fixed in Task 1) is the type Task 2 (Dashboard) and Task 3 (GoalCard) both consume — Task 3's local `Goal` interface in `GoalCard.tsx` already declared `category` as present, so Task 1's fix makes real data match a shape the component already expected, rather than requiring a `GoalCard.tsx` type change. `WeekResult`/`WeekGoal`/`WeekEntry` (Phase 3) and `GoalHistory` (Phase 2) were deliberately named and shaped to match this page's pre-existing local interfaces exactly, confirmed field-by-field in Tasks 4 and 6.

## What Phase 6b needs from this phase (for the next plan document)

- Every remaining page still on the old backend (`stats`, `milestones`, `settings`) and every remaining auth-surface file (`NavBar.tsx`'s Abmelden button, `/login`, `/register`, `src/middleware.ts`, `src/app/layout.tsx`'s `SessionProviderWrapper`) is completely unaffected by this phase and can be planned independently — none of Phase 6a's changes touch them.
- `reminders.ts`'s `enableReminders`/`disableReminders`/`isRemindersEnabled` (Phase 5, Task 2) are still unused by any page — Phase 6b's Settings rewiring is where they finally get called from real UI, which is also the first real (manual, Playwright) verification they'll receive.
