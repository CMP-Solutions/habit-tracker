# Local Storage Migration — Phase 5: Client-Side Reminders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the server-cron Web Push reminder (`src/app/api/push/send-reminders/route.ts`, `web-push`, `PushSubscription`) with a client-only reminder: a plain `Notification` shown at most once per day, in the evening, while the app is open — no service worker, no push subscription, no server endpoint (spec §2, "Erinnerungen werden rein clientseitig").

**Architecture:** A single new `src/lib/reminders.ts`, split into two halves: pure decision/data functions (`countOpenGoals`, `reminderMessage`, `shouldNotify`) with full unit-test coverage, and thin browser-API glue (`isRemindersEnabled`, `enableReminders`, `disableReminders`, `maybeShowReminder`) that calls `localStorage`/`Notification` directly. The existing `src/lib/push-client.ts` has never had a unit test file for exactly this reason — direct browser-API calls aren't meaningfully unit-testable without mocking away the thing being tested — so this phase follows that same precedent for its own glue layer rather than inventing a mock-heavy test that doesn't verify real behavior; that half is verified by hand in the browser during Phase 6, per this project's Playwright-verification rule for UI-facing behavior.

**Tech Stack:** No new dependencies — `Notification` and `localStorage` are browser built-ins.

**Spec:** `docs/superpowers/specs/2026-09-14-local-storage-migration.md`

## Global Constraints

- Do not modify `src/lib/domain/*`, `src/app/api/**`, `src/lib/push.ts`, `src/lib/push-client.ts`, `public/sw.js`, or any existing test — the old push infrastructure is tightly coupled to `PushSubscription`/`User`/NextAuth and is removed together with the rest of the server backend in Phase 7 (Cleanup), not here. Phase 5 only adds the new reminders module alongside the old one.
- `localStorage` (not Dexie) is the right store for the two small reminder preferences this phase adds (`ritual:reminders-enabled`, `ritual:reminders-last-notified`) — these are per-browser UI toggles, not app data. The earlier localStorage-vs-IndexedDB decision (spec §2) was about the primary dataset (goals/entries/etc., which need range queries and can grow large); a single boolean flag and a single date string carry none of that pressure, and reusing Dexie for two trivial key-value flags would only add ceremony (async transactions) for no benefit over `localStorage.getItem`/`setItem`, which is synchronous and adequate here.
- No push notifications while the browser/tab is fully closed — this is a deliberate, already-agreed functional downgrade from the old server-push behavior (spec §2), not a bug to work around in this phase.

---

### Task 1: Pure reminder logic — `countOpenGoals`, `reminderMessage`, `shouldNotify`

**Files:**
- Create: `src/lib/reminders.ts`
- Test: `src/lib/__tests__/reminders.test.ts`

**Interfaces:**
- Consumes: `GoalWithProgress` type from `./storage/goals` (Phase 2, already exists — `{ todayEntry: { done: boolean; value: number | null } | null; type: "boolean" | "quantitative"; targetValue: number | null; ... }`).
- Produces: `countOpenGoals(goals: GoalWithProgress[]): number`, `reminderMessage(openCount: number): string`, `shouldNotify(params: { openCount: number; enabled: boolean; permissionGranted: boolean; hour: number; todayKey: string; lastNotifiedKey: string | null }): boolean`.

This mirrors `send-reminders/route.ts`'s existing `openCount` computation (`goal.type === "boolean" ? !entry.done : (entry.value ?? 0) < (goal.targetValue ?? Infinity)`) and message text exactly.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/reminders.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/reminders.test.ts`
Expected: FAIL with a module-not-found error for `../reminders`.

- [ ] **Step 3: Write `src/lib/reminders.ts`** (this task's portion only — the pure functions)

```ts
import type { GoalWithProgress } from "./storage/goals";

/** Local hour after which an evening reminder may fire. */
const REMINDER_HOUR = 18;

/** How many of today's goals are still open (unchecked, or below target). */
export function countOpenGoals(goals: GoalWithProgress[]): number {
  return goals.filter((goal) => {
    if (!goal.todayEntry) return true;
    return goal.type === "boolean"
      ? !goal.todayEntry.done
      : (goal.todayEntry.value ?? 0) < (goal.targetValue ?? Infinity);
  }).length;
}

export function reminderMessage(openCount: number): string {
  return openCount === 1 ? "Du hast heute noch 1 offenes Ziel." : `Du hast heute noch ${openCount} offene Ziele.`;
}

/**
 * Pure decision of whether an evening reminder should fire right now, given
 * already-gathered facts about permission, local time, and today's earlier
 * notification history. Kept free of browser globals so it's unit-testable;
 * the browser-API glue that gathers these facts and calls Notification()
 * lives in the rest of this file (Task 2), verified manually instead — see
 * this plan's architecture note.
 */
export function shouldNotify(params: {
  openCount: number;
  enabled: boolean;
  permissionGranted: boolean;
  hour: number;
  todayKey: string;
  lastNotifiedKey: string | null;
}): boolean {
  if (!params.enabled || !params.permissionGranted) return false;
  if (params.openCount <= 0) return false;
  if (params.hour < REMINDER_HOUR) return false;
  if (params.lastNotifiedKey === params.todayKey) return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/reminders.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/reminders.ts src/lib/__tests__/reminders.test.ts
git commit -m "feat: add pure reminder logic (open-goal count, message, notify decision)"
```

---

### Task 2: Browser-API glue — enable/disable/fire

**Files:**
- Modify: `src/lib/reminders.ts`

**Interfaces:**
- Consumes: everything from Task 1.
- Produces: `isRemindersEnabled(): boolean`, `enableReminders(): Promise<void>` (throws a German-language `Error` if `Notification` is unsupported or permission is denied, mirroring `push-client.ts`'s existing error style), `disableReminders(): void`, `maybeShowReminder(openCount: number): void`.

No automated test for this task — see the plan's architecture note above. Verification is manual, in the browser, during Phase 6 once the Settings page actually calls these functions (this mirrors exactly how `push-client.ts`'s equivalent functions were verified when they were built: no unit test file, verified by hand through the running app).

- [ ] **Step 1: Append the browser-glue functions to `src/lib/reminders.ts`**

```ts
const ENABLED_KEY = "ritual:reminders-enabled";
const LAST_NOTIFIED_KEY = "ritual:reminders-last-notified";

function todayKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function isRemindersEnabled(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(ENABLED_KEY) === "true";
}

export async function enableReminders(): Promise<void> {
  if (typeof Notification === "undefined") {
    throw new Error("Benachrichtigungen werden von diesem Browser nicht unterstützt.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Berechtigung für Benachrichtigungen wurde nicht erteilt.");
  }
  localStorage.setItem(ENABLED_KEY, "true");
}

export function disableReminders(): void {
  localStorage.removeItem(ENABLED_KEY);
}

/**
 * Called on app load/focus with the current open-goal count; shows a plain
 * browser Notification at most once per day, only in the evening, only if
 * enabled and permitted. No service worker or push subscription — this can
 * only fire while the tab is open, per the local-only reminders decision
 * (spec §2). Untested by design — see this plan's architecture note.
 */
export function maybeShowReminder(openCount: number): void {
  const now = new Date();
  const fire = shouldNotify({
    openCount,
    enabled: isRemindersEnabled(),
    permissionGranted: typeof Notification !== "undefined" && Notification.permission === "granted",
    hour: now.getHours(),
    todayKey: todayKey(now),
    lastNotifiedKey: localStorage.getItem(LAST_NOTIFIED_KEY),
  });
  if (!fire) return;

  new Notification("Ritual", { body: reminderMessage(openCount) });
  localStorage.setItem(LAST_NOTIFIED_KEY, todayKey(now));
}
```

- [ ] **Step 2: Run the full test suite, typecheck, and lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: every test passes (Phases 1–4's 63 storage tests + this phase's 13 new pure tests + all 83 pre-existing tests = 159), no type errors, no lint errors. (Task 2 adds no new tests, so the count only grows by Task 1's 13.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/reminders.ts
git commit -m "feat: add browser-API glue for local reminders (enable/disable/fire)"
```

---

## Self-Review Notes

- **Spec coverage:** Spec §2 ("Erinnerungen werden rein clientseitig ... Der bisherige serverseitige Cron-Push ... entfällt ersatzlos") → Task 1 + Task 2 together are the complete replacement. The old push code is explicitly left in place per Global Constraints, matching spec §5's Phase 7 (Cleanup) ownership of removing it.
- **Placeholder scan:** none in the code itself. Task 2 deliberately has no test step, which could look like a gap against the "No Placeholders" rule — it isn't one: the rule forbids vague *instructions* ("add appropriate error handling" with no code), not a documented, precedented decision not to unit-test browser-API glue. The reasoning and the precedent (`push-client.ts`) are stated explicitly rather than silently skipped.
- **Type consistency:** `GoalWithProgress` is imported unchanged from Phase 2's `./storage/goals` — Task 1's test file constructs a full literal of that exact shape (`goal()` helper) rather than a loosely-typed stand-in, so a future field added to `GoalWithProgress` would surface as a type error in the test file, not silently pass.

## What Phase 6 needs from this phase (for the next plan document)

- The Settings page's "Erinnerungen" section swaps `getExistingPushSubscription`/`subscribeToPush`/`unsubscribeFromPush` (from `push-client.ts`) for `isRemindersEnabled`/`enableReminders`/`disableReminders` (from `reminders.ts`) — same toggle-button UX, different underlying mechanism.
- Wherever Phase 6 loads `listGoalsWithProgress()` for the dashboard, it should also call `maybeShowReminder(countOpenGoals(goals))` once per load — this is the actual trigger point Phase 5 has no UI to hang itself on yet.
