# Termine/Ereignisse Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-contained calendar feature (`events` table, recurrence support for weekly/yearly, month/week grid UI) so users can track one-off and recurring appointments alongside Ziele and ToDos.

**Architecture:** A new Dexie table `events` stores one row per event series (recurrence rule, not materialized occurrences). A pure domain function expands a series into concrete dates for a given date range on read, following the existing "derive, don't store" convention used for streaks and period evaluation. A new `/kalender` page renders a month grid (default) or week grid, both built from a shared pure date-grid helper and a shared `CalendarGrid` component.

**Tech Stack:** Next.js App Router, TypeScript, Dexie (IndexedDB), Tailwind CSS v4, shadcn/ui (`@base-ui/react` primitives), Vitest + `fake-indexeddb` for storage tests.

**Spec:** `docs/superpowers/specs/2026-09-17-calendar-events-phase-a-design.md`

## Global Constraints

- All calendar-day values are UTC-midnight `Date`s or `"YYYY-MM-DD"` strings, following `src/lib/domain/window.ts` — never construct dates from local time.
- Weeks start on Monday everywhere (matches `mondayOf()` in `src/lib/domain/weeklyGoal.ts`).
- Recurrence is limited to `"none" | "weekly" | "yearly"` — no `"daily"`/`"monthly"` in this phase.
- Editing or deleting an event always applies to the whole series — no per-occurrence exceptions.
- `events` must be part of `backup.ts` (export/import) from the task that introduces the table onward — not deferred to a later fix.
- No new npm dependency — the calendar grid is built with plain Tailwind, no calendar library.
- German UI copy throughout, matching existing tone (e.g. "Neuer Termin", "Wiederholung", "Ganztägig").

---

### Task 1: Data model — `events` table

**Files:**
- Modify: `src/lib/storage/db.ts`
- Modify: `src/lib/storage/__tests__/db.test.ts`

**Interfaces:**
- Produces: `EventRecord` interface (exported from `src/lib/storage/db.ts`), `db.events: EntityTable<EventRecord, "id">`.

- [ ] **Step 1: Add the `EventRecord` interface and wire it into the Dexie schema**

In `src/lib/storage/db.ts`, add this interface after `TodoRecord`:

```ts
export interface EventRecord {
  id: string;
  title: string;
  /** "YYYY-MM-DD", UTC calendar day — the first/only occurrence of the series. */
  date: string;
  allDay: boolean;
  /** "HH:mm", only meaningful when allDay is false. */
  time: string | null;
  recurrence: "none" | "weekly" | "yearly";
  /** "YYYY-MM-DD" — the day the event was created, UTC. */
  createdAt: string;
}
```

Add `events: EntityTable<EventRecord, "id">;` to the `RitualDb` type:

```ts
type RitualDb = Dexie & {
  categories: EntityTable<CategoryRecord, "id">;
  goals: EntityTable<GoalRecord, "id">;
  entries: EntityTable<EntryRecord, "id">;
  milestones: EntityTable<MilestoneRecord, "id">;
  todos: EntityTable<TodoRecord, "id">;
  events: EntityTable<EventRecord, "id">;
};
```

Add a new `db.version(3)` block after the existing `db.version(2)` block, repeating every prior table's index string unchanged and adding `events`:

```ts
db.version(3).stores({
  categories: "id, name",
  goals: "id, archived, categoryId, createdAt",
  entries: "id, goalId, date, [goalId+date]",
  milestones: "id, goalId, [goalId+type+threshold]",
  todos: "id, done, dueDate",
  events: "id, date",
});
```

- [ ] **Step 2: Update the "opens with the expected tables" test**

In `src/lib/storage/__tests__/db.test.ts`, change:

```ts
    expect(db.tables.map((t) => t.name).sort()).toEqual(["categories", "entries", "goals", "milestones", "todos"]);
```

to:

```ts
    expect(db.tables.map((t) => t.name).sort()).toEqual(["categories", "entries", "events", "goals", "milestones", "todos"]);
```

- [ ] **Step 3: Run the test suite**

Run: `npx vitest run src/lib/storage/__tests__/db.test.ts`
Expected: PASS (all tests in the file, including the updated table-list assertion)

- [ ] **Step 4: Commit**

```bash
git add src/lib/storage/db.ts src/lib/storage/__tests__/db.test.ts
git commit -m "feat: add events table to Dexie schema"
```

---

### Task 2: Domain layer — event occurrences and calendar grid helpers

**Files:**
- Create: `src/lib/domain/eventOccurrences.ts`
- Create: `src/lib/domain/__tests__/eventOccurrences.test.ts`
- Create: `src/lib/domain/calendarGrid.ts`
- Create: `src/lib/domain/__tests__/calendarGrid.test.ts`

**Interfaces:**
- Consumes: `EventRecord` from `src/lib/storage/db.ts` (`{ id, title, date, allDay, time, recurrence, createdAt }`).
- Produces: `EventOccurrence` type and `occurrencesInRange(events, rangeStart, rangeEnd)` from `eventOccurrences.ts`; `monthGridDays(monthAnchor)` and `weekDays(dateInWeek)` from `calendarGrid.ts` — both later consumed by the storage layer (Task 3) and the calendar page (Tasks 6-7).

- [ ] **Step 1: Write the failing tests for `occurrencesInRange`**

Create `src/lib/domain/__tests__/eventOccurrences.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { occurrencesInRange } from "../eventOccurrences";
import type { EventRecord } from "@/lib/storage/db";

function makeEvent(overrides: Partial<EventRecord>): EventRecord {
  return {
    id: "e1",
    title: "Termin",
    date: "2026-09-10",
    allDay: true,
    time: null,
    recurrence: "none",
    createdAt: "2026-09-01",
    ...overrides,
  };
}

function range(startStr: string, endStr: string) {
  return {
    rangeStart: new Date(startStr + "T00:00:00Z"),
    rangeEnd: new Date(endStr + "T00:00:00Z"),
  };
}

describe("occurrencesInRange: recurrence 'none'", () => {
  it("includes a one-off event whose date falls within the range", () => {
    const event = makeEvent({ date: "2026-09-15" });
    const { rangeStart, rangeEnd } = range("2026-09-01", "2026-10-01");
    const result = occurrencesInRange([event], rangeStart, rangeEnd);
    expect(result).toEqual([{ eventId: "e1", title: "Termin", date: "2026-09-15", allDay: true, time: null }]);
  });

  it("excludes a one-off event before the range", () => {
    const event = makeEvent({ date: "2026-08-15" });
    const { rangeStart, rangeEnd } = range("2026-09-01", "2026-10-01");
    expect(occurrencesInRange([event], rangeStart, rangeEnd)).toEqual([]);
  });

  it("excludes a one-off event after the range", () => {
    const event = makeEvent({ date: "2026-10-15" });
    const { rangeStart, rangeEnd } = range("2026-09-01", "2026-10-01");
    expect(occurrencesInRange([event], rangeStart, rangeEnd)).toEqual([]);
  });

  it("includes an event exactly at rangeStart (inclusive)", () => {
    const event = makeEvent({ date: "2026-09-01" });
    const { rangeStart, rangeEnd } = range("2026-09-01", "2026-10-01");
    expect(occurrencesInRange([event], rangeStart, rangeEnd)).toHaveLength(1);
  });

  it("excludes an event exactly at rangeEnd (exclusive)", () => {
    const event = makeEvent({ date: "2026-10-01" });
    const { rangeStart, rangeEnd } = range("2026-09-01", "2026-10-01");
    expect(occurrencesInRange([event], rangeStart, rangeEnd)).toEqual([]);
  });
});

describe("occurrencesInRange: recurrence 'weekly'", () => {
  it("generates one occurrence per matching weekday across a range", () => {
    // 2026-09-01 is a Tuesday.
    const event = makeEvent({ date: "2026-09-01", recurrence: "weekly" });
    const { rangeStart, rangeEnd } = range("2026-09-01", "2026-09-29");
    const result = occurrencesInRange([event], rangeStart, rangeEnd);
    expect(result.map((o) => o.date)).toEqual(["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22"]);
  });

  it("aligns to the correct weekday when the range starts mid-series", () => {
    const event = makeEvent({ date: "2026-09-01", recurrence: "weekly" });
    const { rangeStart, rangeEnd } = range("2026-09-10", "2026-09-24");
    const result = occurrencesInRange([event], rangeStart, rangeEnd);
    expect(result.map((o) => o.date)).toEqual(["2026-09-15", "2026-09-22"]);
  });

  it("produces no occurrences when the series starts after the range", () => {
    const event = makeEvent({ date: "2026-12-01", recurrence: "weekly" });
    const { rangeStart, rangeEnd } = range("2026-09-01", "2026-10-01");
    expect(occurrencesInRange([event], rangeStart, rangeEnd)).toEqual([]);
  });
});

describe("occurrencesInRange: recurrence 'yearly'", () => {
  it("generates one occurrence per year on the same month/day", () => {
    const event = makeEvent({ date: "2024-03-05", recurrence: "yearly" });
    const { rangeStart, rangeEnd } = range("2026-01-01", "2029-01-01");
    const result = occurrencesInRange([event], rangeStart, rangeEnd);
    expect(result.map((o) => o.date)).toEqual(["2026-03-05", "2027-03-05", "2028-03-05"]);
  });

  it("falls back Feb 29 to Feb 28 in a non-leap year", () => {
    const event = makeEvent({ date: "2024-02-29", recurrence: "yearly" });
    const { rangeStart, rangeEnd } = range("2025-01-01", "2026-01-01");
    const result = occurrencesInRange([event], rangeStart, rangeEnd);
    expect(result.map((o) => o.date)).toEqual(["2025-02-28"]);
  });

  it("keeps Feb 29 in a leap year", () => {
    const event = makeEvent({ date: "2024-02-29", recurrence: "yearly" });
    const { rangeStart, rangeEnd } = range("2028-01-01", "2029-01-01");
    const result = occurrencesInRange([event], rangeStart, rangeEnd);
    expect(result.map((o) => o.date)).toEqual(["2028-02-29"]);
  });
});

describe("occurrencesInRange: multiple events", () => {
  it("combines and sorts occurrences from several events by date", () => {
    const eventA = makeEvent({ id: "a", title: "A", date: "2026-09-20" });
    const eventB = makeEvent({ id: "b", title: "B", date: "2026-09-10" });
    const { rangeStart, rangeEnd } = range("2026-09-01", "2026-10-01");
    const result = occurrencesInRange([eventA, eventB], rangeStart, rangeEnd);
    expect(result.map((o) => o.eventId)).toEqual(["b", "a"]);
  });

  it("carries allDay and time through to the occurrence", () => {
    const event = makeEvent({ date: "2026-09-10", allDay: false, time: "14:30" });
    const { rangeStart, rangeEnd } = range("2026-09-01", "2026-10-01");
    const result = occurrencesInRange([event], rangeStart, rangeEnd);
    expect(result[0]).toMatchObject({ allDay: false, time: "14:30" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/domain/__tests__/eventOccurrences.test.ts`
Expected: FAIL with "Cannot find module '../eventOccurrences'" (or similar — the module doesn't exist yet)

- [ ] **Step 3: Implement `occurrencesInRange`**

Create `src/lib/domain/eventOccurrences.ts`:

```ts
import type { EventRecord } from "@/lib/storage/db";

export interface EventOccurrence {
  eventId: string;
  title: string;
  /** "YYYY-MM-DD" of this concrete occurrence. */
  date: string;
  allDay: boolean;
  time: string | null;
}

const MS_PER_DAY = 86_400_000;

function parseUtcMidnight(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00Z");
}

function addUtcDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toOccurrence(event: EventRecord, date: string): EventOccurrence {
  return { eventId: event.id, title: event.title, date, allDay: event.allDay, time: event.time };
}

/**
 * Feb 29 has no equivalent in a non-leap year — rather than skip the
 * occurrence entirely, it falls back to Feb 28 of that year.
 */
function yearlyOccurrenceInYear(originalDate: Date, year: number): Date {
  const month = originalDate.getUTCMonth();
  const day = originalDate.getUTCDate();
  const isFeb29 = month === 1 && day === 29;
  if (isFeb29) {
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    if (!isLeapYear) return new Date(Date.UTC(year, 1, 28));
  }
  return new Date(Date.UTC(year, month, day));
}

function noneOccurrences(event: EventRecord, rangeStart: Date, rangeEnd: Date): EventOccurrence[] {
  const eventDate = parseUtcMidnight(event.date);
  if (eventDate >= rangeStart && eventDate < rangeEnd) {
    return [toOccurrence(event, event.date)];
  }
  return [];
}

function weeklyOccurrences(event: EventRecord, rangeStart: Date, rangeEnd: Date): EventOccurrence[] {
  const eventDate = parseUtcMidnight(event.date);
  if (eventDate >= rangeEnd) return [];

  let cursor = eventDate;
  if (cursor < rangeStart) {
    const diffDays = Math.floor((rangeStart.getTime() - cursor.getTime()) / MS_PER_DAY);
    const weeksToAdd = Math.ceil(diffDays / 7);
    cursor = addUtcDays(cursor, weeksToAdd * 7);
  }

  const result: EventOccurrence[] = [];
  while (cursor < rangeEnd) {
    if (cursor >= rangeStart) {
      result.push(toOccurrence(event, toDateString(cursor)));
    }
    cursor = addUtcDays(cursor, 7);
  }
  return result;
}

function yearlyOccurrences(event: EventRecord, rangeStart: Date, rangeEnd: Date): EventOccurrence[] {
  const eventDate = parseUtcMidnight(event.date);
  const result: EventOccurrence[] = [];
  for (let year = rangeStart.getUTCFullYear(); year <= rangeEnd.getUTCFullYear(); year++) {
    if (year < eventDate.getUTCFullYear()) continue;
    const occurrence = yearlyOccurrenceInYear(eventDate, year);
    if (occurrence >= rangeStart && occurrence < rangeEnd) {
      result.push(toOccurrence(event, toDateString(occurrence)));
    }
  }
  return result;
}

/**
 * Expands each event's recurrence rule into concrete dates within
 * [rangeStart, rangeEnd) — never stored, always computed on read, the same
 * convention as streaks and period evaluation elsewhere in the domain layer.
 */
export function occurrencesInRange(events: EventRecord[], rangeStart: Date, rangeEnd: Date): EventOccurrence[] {
  const result: EventOccurrence[] = [];
  for (const event of events) {
    if (event.recurrence === "none") result.push(...noneOccurrences(event, rangeStart, rangeEnd));
    else if (event.recurrence === "weekly") result.push(...weeklyOccurrences(event, rangeStart, rangeEnd));
    else result.push(...yearlyOccurrences(event, rangeStart, rangeEnd));
  }
  return result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/domain/__tests__/eventOccurrences.test.ts`
Expected: PASS (all 12 tests)

- [ ] **Step 5: Write the failing tests for the calendar grid helpers**

Create `src/lib/domain/__tests__/calendarGrid.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { monthGridDays, weekDays } from "../calendarGrid";

function toDateStrings(days: Date[]): string[] {
  return days.map((d) => d.toISOString().slice(0, 10));
}

describe("monthGridDays", () => {
  it("returns 42 days starting on the Monday on/before the 1st", () => {
    // September 2026 starts on a Tuesday.
    const days = monthGridDays(new Date("2026-09-15T00:00:00Z"));
    expect(days).toHaveLength(42);
    expect(toDateStrings(days)[0]).toBe("2026-08-31"); // Monday before Sep 1
  });

  it("returns consecutive days", () => {
    const days = monthGridDays(new Date("2026-09-15T00:00:00Z"));
    const strings = toDateStrings(days);
    expect(strings[1]).toBe("2026-09-01");
    expect(strings[41]).toBe("2026-10-11");
  });

  it("starts on the 1st itself when the month already starts on a Monday", () => {
    // June 2026 starts on a Monday.
    const days = monthGridDays(new Date("2026-06-10T00:00:00Z"));
    expect(toDateStrings(days)[0]).toBe("2026-06-01");
  });
});

describe("weekDays", () => {
  it("returns 7 consecutive days starting on Monday", () => {
    // 2026-09-16 is a Wednesday.
    const days = weekDays(new Date("2026-09-16T00:00:00Z"));
    expect(toDateStrings(days)).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
  });

  it("returns the same week when given a Monday", () => {
    const days = weekDays(new Date("2026-09-14T00:00:00Z"));
    expect(toDateStrings(days)[0]).toBe("2026-09-14");
  });

  it("returns the same week when given a Sunday", () => {
    const days = weekDays(new Date("2026-09-20T00:00:00Z"));
    expect(toDateStrings(days)[0]).toBe("2026-09-14");
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/lib/domain/__tests__/calendarGrid.test.ts`
Expected: FAIL with "Cannot find module '../calendarGrid'"

- [ ] **Step 7: Implement the calendar grid helpers**

Create `src/lib/domain/calendarGrid.ts`:

```ts
/** Monday-on-or-before `date`, at UTC midnight. Matches mondayOf() in weeklyGoal.ts. */
function startOfWeekUtc(date: Date): Date {
  const dayOfWeek = date.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const start = new Date(date);
  start.setUTCDate(start.getUTCDate() + diffToMonday);
  return start;
}

function daysFrom(start: Date, count: number): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    days.push(d);
  }
  return days;
}

/**
 * A fixed 6-week (42-day) grid covering the month `monthAnchor` falls in,
 * starting on the Monday on/before the 1st — the standard calendar-grid
 * layout, regardless of how many weeks the month itself spans.
 */
export function monthGridDays(monthAnchor: Date): Date[] {
  const firstOfMonth = new Date(Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth(), 1));
  return daysFrom(startOfWeekUtc(firstOfMonth), 42);
}

/** The 7 days (Monday-Sunday) of the week containing `dateInWeek`. */
export function weekDays(dateInWeek: Date): Date[] {
  return daysFrom(startOfWeekUtc(dateInWeek), 7);
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/lib/domain/__tests__/calendarGrid.test.ts`
Expected: PASS (all 6 tests)

- [ ] **Step 9: Commit**

```bash
git add src/lib/domain/eventOccurrences.ts src/lib/domain/__tests__/eventOccurrences.test.ts src/lib/domain/calendarGrid.ts src/lib/domain/__tests__/calendarGrid.test.ts
git commit -m "feat: add event occurrence expansion and calendar grid domain helpers"
```

---

### Task 3: Storage layer — `src/lib/storage/events.ts`

**Files:**
- Create: `src/lib/storage/events.ts`
- Create: `src/lib/storage/__tests__/events.test.ts`

**Interfaces:**
- Consumes: `db` and `EventRecord` from `./db` (Task 1); `generateId` from `./id`; `utcToday` from `@/lib/domain/window`; `occurrencesInRange`/`EventOccurrence` from `@/lib/domain/eventOccurrences` (Task 2).
- Produces: `CreateEventInput`, `createEvent`, `getEvent`, `updateEvent`, `deleteEvent`, `listEvents`, `getOccurrencesForRange` — consumed by `EventForm` (Task 5) and the calendar pages (Tasks 6-7).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/storage/__tests__/events.test.ts`:

```ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { createEvent, getEvent, updateEvent, deleteEvent, listEvents, getOccurrencesForRange } from "../events";

describe("events storage: CRUD", () => {
  beforeEach(async () => {
    await db.events.clear();
  });

  it("creates an all-day event with defaults", async () => {
    const event = await createEvent({ title: "Geburtstag Mama", date: "2026-10-05", allDay: true, recurrence: "none" });
    expect(event.title).toBe("Geburtstag Mama");
    expect(event.date).toBe("2026-10-05");
    expect(event.allDay).toBe(true);
    expect(event.time).toBeNull();
    expect(event.recurrence).toBe("none");
    expect(event.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("creates a timed event", async () => {
    const event = await createEvent({
      title: "Zahnarzt",
      date: "2026-10-05",
      allDay: false,
      time: "09:30",
      recurrence: "none",
    });
    expect(event.allDay).toBe(false);
    expect(event.time).toBe("09:30");
  });

  it("forces time to null when allDay is true even if time is passed", async () => {
    const event = await createEvent({ title: "Feiertag", date: "2026-10-03", allDay: true, time: "09:00", recurrence: "none" });
    expect(event.time).toBeNull();
  });

  it("rejects an empty title", async () => {
    await expect(createEvent({ title: "", date: "2026-10-05", allDay: true, recurrence: "none" })).rejects.toThrow();
    await expect(createEvent({ title: "   ", date: "2026-10-05", allDay: true, recurrence: "none" })).rejects.toThrow();
  });

  it("trims the title", async () => {
    const event = await createEvent({ title: "  Umzug  ", date: "2026-10-05", allDay: true, recurrence: "none" });
    expect(event.title).toBe("Umzug");
  });

  it("gets an event by id", async () => {
    const created = await createEvent({ title: "Konzert", date: "2026-10-05", allDay: true, recurrence: "none" });
    const fetched = await getEvent(created.id);
    expect(fetched).toEqual(created);
  });

  it("throws when getting a nonexistent event", async () => {
    await expect(getEvent("does-not-exist")).rejects.toThrow("Not found");
  });

  it("updates an event's fields", async () => {
    const created = await createEvent({ title: "Konzert", date: "2026-10-05", allDay: true, recurrence: "none" });
    const updated = await updateEvent(created.id, { title: "Konzert (verschoben)", date: "2026-10-06" });
    expect(updated.title).toBe("Konzert (verschoben)");
    expect(updated.date).toBe("2026-10-06");
  });

  it("clears time when updating allDay to true", async () => {
    const created = await createEvent({ title: "Meeting", date: "2026-10-05", allDay: false, time: "14:00", recurrence: "none" });
    const updated = await updateEvent(created.id, { allDay: true });
    expect(updated.allDay).toBe(true);
    expect(updated.time).toBeNull();
  });

  it("rejects updating to an empty title", async () => {
    const created = await createEvent({ title: "Konzert", date: "2026-10-05", allDay: true, recurrence: "none" });
    await expect(updateEvent(created.id, { title: "   " })).rejects.toThrow();
  });

  it("throws when updating a nonexistent event", async () => {
    await expect(updateEvent("does-not-exist", { title: "x" })).rejects.toThrow("Not found");
  });

  it("deletes an event", async () => {
    const created = await createEvent({ title: "Konzert", date: "2026-10-05", allDay: true, recurrence: "none" });
    await deleteEvent(created.id);
    await expect(getEvent(created.id)).rejects.toThrow("Not found");
  });

  it("does not throw deleting a nonexistent event", async () => {
    await expect(deleteEvent("does-not-exist")).resolves.toBeUndefined();
  });

  it("lists all events", async () => {
    await createEvent({ title: "A", date: "2026-10-05", allDay: true, recurrence: "none" });
    await createEvent({ title: "B", date: "2026-10-06", allDay: true, recurrence: "none" });
    const all = await listEvents();
    expect(all).toHaveLength(2);
  });
});

describe("getOccurrencesForRange", () => {
  beforeEach(async () => {
    await db.events.clear();
  });

  it("returns occurrences for a one-off event within range", async () => {
    await createEvent({ title: "Geburtstag", date: "2026-10-05", allDay: true, recurrence: "none" });
    const result = await getOccurrencesForRange(new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"));
    expect(result.map((o) => o.title)).toEqual(["Geburtstag"]);
  });

  it("expands a weekly event into multiple occurrences", async () => {
    await createEvent({ title: "Sport", date: "2026-10-05", allDay: true, recurrence: "weekly" });
    const result = await getOccurrencesForRange(new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"));
    expect(result.length).toBeGreaterThan(1);
  });

  it("returns nothing for a range with no matching events", async () => {
    await createEvent({ title: "Geburtstag", date: "2026-10-05", allDay: true, recurrence: "none" });
    const result = await getOccurrencesForRange(new Date("2027-01-01T00:00:00Z"), new Date("2027-02-01T00:00:00Z"));
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/storage/__tests__/events.test.ts`
Expected: FAIL with "Cannot find module '../events'"

- [ ] **Step 3: Implement the storage layer**

Create `src/lib/storage/events.ts`:

```ts
import { db, type EventRecord } from "./db";
import { generateId } from "./id";
import { utcToday } from "@/lib/domain/window";
import { occurrencesInRange, type EventOccurrence } from "@/lib/domain/eventOccurrences";

function todayString(): string {
  return utcToday().toISOString().slice(0, 10);
}

export interface CreateEventInput {
  title: string;
  date: string;
  allDay: boolean;
  time?: string | null;
  recurrence: "none" | "weekly" | "yearly";
}

export async function createEvent(input: CreateEventInput): Promise<EventRecord> {
  if (!input.title || !input.title.trim()) {
    throw new Error("title is required.");
  }
  const event: EventRecord = {
    id: generateId(),
    title: input.title.trim(),
    date: input.date,
    allDay: input.allDay,
    time: input.allDay ? null : (input.time ?? null),
    recurrence: input.recurrence,
    createdAt: todayString(),
  };
  await db.events.add(event);
  return event;
}

export async function getEvent(id: string): Promise<EventRecord> {
  const event = await db.events.get(id);
  if (!event) throw new Error("Not found");
  return event;
}

export async function updateEvent(id: string, patch: Partial<CreateEventInput>): Promise<EventRecord> {
  const existing = await db.events.get(id);
  if (!existing) throw new Error("Not found");
  if (patch.title !== undefined && !patch.title.trim()) {
    throw new Error("title is required.");
  }
  const changes: Partial<EventRecord> = { ...patch };
  if (patch.title !== undefined) changes.title = patch.title.trim();

  const allDay = patch.allDay ?? existing.allDay;
  if (allDay) {
    changes.time = null;
  } else if (patch.time !== undefined) {
    changes.time = patch.time;
  }

  await db.events.update(id, changes);
  return (await db.events.get(id)) as EventRecord;
}

export async function deleteEvent(id: string): Promise<void> {
  await db.events.delete(id);
}

export async function listEvents(): Promise<EventRecord[]> {
  return db.events.toArray();
}

export async function getOccurrencesForRange(rangeStart: Date, rangeEnd: Date): Promise<EventOccurrence[]> {
  const events = await listEvents();
  return occurrencesInRange(events, rangeStart, rangeEnd);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/storage/__tests__/events.test.ts`
Expected: PASS (all 17 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/events.ts src/lib/storage/__tests__/events.test.ts
git commit -m "feat: add events storage layer with CRUD and occurrence queries"
```

---

### Task 4: Backup integration — export/import `events`

**Files:**
- Modify: `src/lib/storage/backup.ts`
- Modify: `src/lib/storage/__tests__/backup.test.ts`

**Interfaces:**
- Consumes: `EventRecord` from `./db` (Task 1); `createEvent` from `./events` (Task 3) in the test file.
- Produces: `ExportedData.events?: EventRecord[]` — no other task consumes this directly, but it is required by the Global Constraints.

- [ ] **Step 1: Write the failing tests**

In `src/lib/storage/__tests__/backup.test.ts`, add `createEvent` to the import from `"../todos"`'s neighboring import line — add a new import line:

```ts
import { createEvent } from "../events";
```

Add `await db.events.clear();` to both `beforeEach` blocks (the one under `describe("backup storage: exportData", ...)` and the one under `describe("backup storage: importData", ...)`), alongside the existing `await db.todos.clear();` line.

Add to the `it("exports an empty dataset when nothing exists yet", ...)` test, after the `expect(data.todos).toEqual([]);` line:

```ts
    expect(data.events).toEqual([]);
```

Add a new test in the `describe("backup storage: exportData", ...)` block, after the `it("exports todos", ...)` test:

```ts
  it("exports events", async () => {
    const event = await createEvent({ title: "Geburtstag", date: "2026-10-05", allDay: true, recurrence: "none" });

    const data = await exportData();
    expect(data.events).toEqual([event]);
  });
```

In the `it("round-trips: export then import reproduces the same data", ...)` test, add after the `const todo = await createTodo(...)` line:

```ts
    const event = await createEvent({ title: "Geburtstag", date: "2026-10-05", allDay: true, recurrence: "none" });
```

Add `await db.events.clear();` right after the existing `await db.todos.clear();` line in the same test (the block that clears tables between export and import). Then after `expect(await db.todos.toArray()).toEqual([todo]);`, add:

```ts
    expect(await db.events.toArray()).toEqual([event]);
```

Add a new test in the `describe("backup storage: importData", ...)` block, after the `it("imports an old-format export without a todos field, ...)` test:

```ts
  it("imports an old-format export without an events field, resulting in an empty events table", async () => {
    await createEvent({ title: "Sollte verschwinden", date: "2026-10-05", allDay: true, recurrence: "none" });
    const oldExport = {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      categories: [],
      goals: [],
      entries: [],
      milestones: [],
      todos: [],
    };

    await importData(oldExport);

    expect(await db.events.toArray()).toEqual([]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/storage/__tests__/backup.test.ts`
Expected: FAIL — `data.events` is `undefined`, `db.events` import errors are not expected (the table exists from Task 1) but the new assertions fail since `backup.ts` doesn't handle events yet.

- [ ] **Step 3: Implement the backup changes**

In `src/lib/storage/backup.ts`, change the import line:

```ts
import { db, type CategoryRecord, type GoalRecord, type EntryRecord, type MilestoneRecord, type TodoRecord } from "./db";
```

to:

```ts
import { db, type CategoryRecord, type GoalRecord, type EntryRecord, type MilestoneRecord, type TodoRecord, type EventRecord } from "./db";
```

Change the `ExportedData` interface to add:

```ts
export interface ExportedData {
  version: 1;
  exportedAt: string;
  categories: CategoryRecord[];
  goals: GoalRecord[];
  entries: EntryRecord[];
  milestones: MilestoneRecord[];
  todos?: TodoRecord[];
  events?: EventRecord[];
}
```

Change `exportData` to:

```ts
export async function exportData(): Promise<ExportedData> {
  const [categories, goals, entries, milestones, todos, events] = await Promise.all([
    db.categories.toArray(),
    db.goals.toArray(),
    db.entries.toArray(),
    db.milestones.toArray(),
    db.todos.toArray(),
    db.events.toArray(),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    categories,
    goals,
    entries,
    milestones,
    todos,
    events,
  };
}
```

Add a new validator function after `isTodoRecord`:

```ts
function isEventRecord(v: unknown): v is EventRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.title === "string" &&
    typeof r.date === "string" &&
    typeof r.allDay === "boolean" &&
    (typeof r.time === "string" || r.time === null) &&
    (r.recurrence === "none" || r.recurrence === "weekly" || r.recurrence === "yearly") &&
    typeof r.createdAt === "string"
  );
}
```

In `isValidExport`, add after the `todos` check:

```ts
  if (r.events !== undefined && (!Array.isArray(r.events) || !r.events.every(isEventRecord))) return false;
```

Change `importData`'s transaction to include `db.events`:

```ts
export async function importData(data: unknown): Promise<void> {
  if (!isValidExport(data)) {
    throw new Error("Invalid export file.");
  }

  await db.transaction("rw", db.categories, db.goals, db.entries, db.milestones, db.todos, db.events, async () => {
    await db.categories.clear();
    await db.goals.clear();
    await db.entries.clear();
    await db.milestones.clear();
    await db.todos.clear();
    await db.events.clear();
    await db.categories.bulkAdd(data.categories);
    await db.goals.bulkAdd(data.goals);
    await db.entries.bulkAdd(data.entries);
    await db.milestones.bulkAdd(data.milestones);
    await db.todos.bulkAdd(data.todos ?? []);
    await db.events.bulkAdd(data.events ?? []);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/storage/__tests__/backup.test.ts`
Expected: PASS (all tests, including the new event-related ones)

- [ ] **Step 5: Run the full test suite to check nothing else broke**

Run: `npm test`
Expected: PASS (all test files)

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/backup.ts src/lib/storage/__tests__/backup.test.ts
git commit -m "feat: include events in backup export/import"
```

---

### Task 5: `EventForm` component and create/edit pages

**Files:**
- Create: `src/components/EventForm.tsx`
- Create: `src/app/kalender/new/page.tsx`
- Create: `src/app/kalender/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `createEvent`, `updateEvent`, `getEvent`, `deleteEvent` from `@/lib/storage/events` (Task 3); `EventRecord` from `@/lib/storage/db` (Task 1); UI primitives `Button`, `Input`, `Label`, `Checkbox` from `@/components/ui/*` (existing); `Dialog*` from `@/components/ui/dialog` (existing, used the same way as `src/app/todos/[id]/edit/page.tsx`).
- Produces: `EventForm` component and `ExistingEvent` type, consumed only within this task's two pages. Routes `/kalender/new` and `/kalender/[id]/edit`, linked from Task 6's calendar page and Task 8's navigation.

- [ ] **Step 1: Create the `EventForm` component**

Create `src/components/EventForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { createEvent, updateEvent } from "@/lib/storage/events";
import type { EventRecord } from "@/lib/storage/db";

export interface ExistingEvent {
  id: string;
  title: string;
  date: string;
  allDay: boolean;
  time: string | null;
  recurrence: EventRecord["recurrence"];
}

const RECURRENCE_OPTIONS: { value: EventRecord["recurrence"]; label: string }[] = [
  { value: "none", label: "Keine" },
  { value: "weekly", label: "Wöchentlich" },
  { value: "yearly", label: "Jährlich" },
];

function RecurrenceToggle({
  value,
  onChange,
}: {
  value: EventRecord["recurrence"];
  onChange: (v: EventRecord["recurrence"]) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border bg-muted/50 p-1">
      {RECURRENCE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
            value === opt.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function EventForm({ existingEvent }: { existingEvent?: ExistingEvent }) {
  const router = useRouter();
  const [title, setTitle] = useState(existingEvent?.title ?? "");
  const [date, setDate] = useState(existingEvent?.date ?? "");
  const [allDay, setAllDay] = useState(existingEvent?.allDay ?? true);
  const [time, setTime] = useState(existingEvent?.time ?? "");
  const [recurrence, setRecurrence] = useState<EventRecord["recurrence"]>(existingEvent?.recurrence ?? "none");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = {
      title,
      date,
      allDay,
      time: allDay ? null : time || null,
      recurrence,
    };
    try {
      if (existingEvent) {
        await updateEvent(existingEvent.id, input);
      } else {
        await createEvent(input);
      }
      router.push("/kalender");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border bg-card p-6 backdrop-blur-xl">
      <div className="space-y-2">
        <Label htmlFor="title">Titel</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="z.B. Geburtstag Mama"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="date">Datum</Label>
        <Input id="date" type="date" className="font-mono" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="allDay" checked={allDay} onCheckedChange={(checked) => setAllDay(checked === true)} />
        <Label htmlFor="allDay">Ganztägig</Label>
      </div>

      {!allDay && (
        <div className="space-y-2">
          <Label htmlFor="time">Uhrzeit</Label>
          <Input id="time" type="time" className="font-mono" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      )}

      <div className="space-y-2">
        <Label>Wiederholung</Label>
        <RecurrenceToggle value={recurrence} onChange={setRecurrence} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full">
        {existingEvent ? "Speichern" : "Termin anlegen"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Create the "new event" page**

Create `src/app/kalender/new/page.tsx`:

```tsx
import { EventForm } from "@/components/EventForm";

export default function NewEventPage() {
  return (
    <main className="mx-auto w-full max-w-lg space-y-6 px-6 py-10">
      <h1 className="font-heading text-3xl">Neuer Termin</h1>
      <EventForm />
    </main>
  );
}
```

- [ ] **Step 3: Create the "edit event" page**

Create `src/app/kalender/[id]/edit/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { EventForm, type ExistingEvent } from "@/components/EventForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getEvent, deleteEvent } from "@/lib/storage/events";

export default function EditEventPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<ExistingEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    getEvent(params.id)
      .then(setEvent)
      .catch((err) => setError(err instanceof Error ? err.message : "Termin nicht gefunden."));
  }, [params.id]);

  async function handleConfirm() {
    setDeleteError(null);
    try {
      await deleteEvent(params.id);
      router.push("/kalender");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Löschen fehlgeschlagen.");
    }
  }

  if (error) return <main className="px-6 py-10 text-destructive">{error}</main>;
  if (!event) return <main className="px-6 py-10 text-muted-foreground">Lädt…</main>;

  return (
    <main className="mx-auto w-full max-w-lg space-y-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl">Termin bearbeiten</h1>
        <Dialog>
          <DialogTrigger
            render={
              <Button variant="destructive" size="sm">
                <Trash2 /> Löschen
              </Button>
            }
          />
          <DialogContent role="alertdialog">
            <DialogHeader>
              <DialogTitle>Termin wirklich löschen?</DialogTitle>
              <DialogDescription>
                {`„${event.title}" wird endgültig gelöscht (die gesamte Serie, falls wiederkehrend). Das kann nicht rückgängig gemacht werden.`}
              </DialogDescription>
            </DialogHeader>
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" autoFocus>Abbrechen</Button>} />
              <Button variant="destructive" onClick={handleConfirm}>
                Endgültig löschen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <EventForm existingEvent={event} />
    </main>
  );
}
```

- [ ] **Step 4: Verify the app builds and typechecks**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/components/EventForm.tsx src/app/kalender/new/page.tsx src/app/kalender/[id]/edit/page.tsx
git commit -m "feat: add event creation and editing forms"
```

---

### Task 6: Calendar page — month grid view

**Files:**
- Create: `src/components/CalendarGrid.tsx`
- Create: `src/app/kalender/page.tsx`

**Interfaces:**
- Consumes: `EventOccurrence` from `@/lib/domain/eventOccurrences` (Task 2); `monthGridDays` from `@/lib/domain/calendarGrid` (Task 2); `getOccurrencesForRange` from `@/lib/storage/events` (Task 3); `utcToday` from `@/lib/domain/window`; `buttonVariants` from `@/components/ui/button`.
- Produces: `CalendarGrid` component with props `{ days: Date[]; occurrencesByDate: Map<string, EventOccurrence[]>; currentMonth?: number; todayStr: string; selectedDate: string | null; onSelectDate: (date: string) => void; maxVisible: number }` — reused by Task 7's week view. The `/kalender` route, linked from Task 5's forms (`router.push("/kalender")`) and Task 8's navigation.

- [ ] **Step 1: Create the shared `CalendarGrid` component**

Create `src/components/CalendarGrid.tsx`:

```tsx
import type { EventOccurrence } from "@/lib/domain/eventOccurrences";

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function CalendarGrid({
  days,
  occurrencesByDate,
  currentMonth,
  todayStr,
  selectedDate,
  onSelectDate,
  maxVisible,
}: {
  days: Date[];
  occurrencesByDate: Map<string, EventOccurrence[]>;
  /** When set, days outside this UTC month index (0-11) are dimmed. Omit for a week view where every day is "in view". */
  currentMonth?: number;
  todayStr: string;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  maxVisible: number;
}) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dateStr = day.toISOString().slice(0, 10);
          const dayOccurrences = occurrencesByDate.get(dateStr) ?? [];
          const isOutsideMonth = currentMonth !== undefined && day.getUTCMonth() !== currentMonth;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const visible = dayOccurrences.slice(0, maxVisible);
          const overflowCount = dayOccurrences.length - visible.length;

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onSelectDate(dateStr)}
              className={`min-h-20 rounded-lg border p-1.5 text-left transition-colors ${
                isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              } ${isOutsideMonth ? "opacity-40" : ""}`}
            >
              <span className={`text-xs ${isToday ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                {day.getUTCDate()}
              </span>
              <div className="mt-1 space-y-0.5">
                {visible.map((occ) => (
                  <p key={`${occ.eventId}-${occ.date}`} className="truncate rounded bg-muted px-1 py-0.5 text-[11px]">
                    {occ.title}
                  </p>
                ))}
                {overflowCount > 0 && <p className="text-[11px] text-muted-foreground">+{overflowCount} weitere</p>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the calendar page with month view**

Create `src/app/kalender/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CalendarGrid } from "@/components/CalendarGrid";
import { monthGridDays } from "@/lib/domain/calendarGrid";
import { getOccurrencesForRange } from "@/lib/storage/events";
import type { EventOccurrence } from "@/lib/domain/eventOccurrences";
import { utcToday } from "@/lib/domain/window";

const MONTH_FORMAT = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });
const SELECTED_DAY_FORMAT = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long" });

function formatTimeSuffix(time: string | null): string {
  return time ? ` · ${time}` : "";
}

export default function KalenderPage() {
  const todayStr = utcToday().toISOString().slice(0, 10);
  const [cursor, setCursor] = useState<Date>(() => utcToday());
  const [occurrences, setOccurrences] = useState<EventOccurrence[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const days = monthGridDays(cursor);

  useEffect(() => {
    const rangeStart = days[0];
    const rangeEnd = new Date(days[days.length - 1]);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
    getOccurrencesForRange(rangeStart, rangeEnd).then(setOccurrences);
    // `days` is recomputed fresh from `cursor` every render; `cursor` is the
    // effect's true dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  const occurrencesByDate = new Map<string, EventOccurrence[]>();
  for (const occ of occurrences) {
    const list = occurrencesByDate.get(occ.date) ?? [];
    list.push(occ);
    occurrencesByDate.set(occ.date, list);
  }

  function goToPreviousMonth() {
    setCursor((prev) => {
      const next = new Date(prev);
      next.setUTCMonth(next.getUTCMonth() - 1);
      return next;
    });
  }

  function goToNextMonth() {
    setCursor((prev) => {
      const next = new Date(prev);
      next.setUTCMonth(next.getUTCMonth() + 1);
      return next;
    });
  }

  const selectedOccurrences = selectedDate ? (occurrencesByDate.get(selectedDate) ?? []) : [];

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl">Kalender</h1>
        <Link href="/kalender/new" className={buttonVariants({ size: "sm" })}>
          <Plus /> Neuer Termin
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <button type="button" onClick={goToPreviousMonth} className="rounded-md p-1.5 hover:bg-muted" aria-label="Vorheriger Monat">
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex items-center gap-3">
          <p className="font-medium capitalize">{MONTH_FORMAT.format(cursor)}</p>
          <button
            type="button"
            onClick={() => setCursor(utcToday())}
            className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            Heute
          </button>
        </div>
        <button type="button" onClick={goToNextMonth} className="rounded-md p-1.5 hover:bg-muted" aria-label="Nächster Monat">
          <ChevronRight className="size-4" />
        </button>
      </div>

      <CalendarGrid
        days={days}
        occurrencesByDate={occurrencesByDate}
        currentMonth={cursor.getUTCMonth()}
        todayStr={todayStr}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        maxVisible={3}
      />

      {selectedDate && (
        <div className="space-y-2 rounded-lg border p-4">
          <p className="text-sm font-medium">{SELECTED_DAY_FORMAT.format(new Date(selectedDate + "T00:00:00Z"))}</p>
          {selectedOccurrences.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Termine.</p>
          ) : (
            <ul className="space-y-1">
              {selectedOccurrences.map((occ) => (
                <li key={`${occ.eventId}-${occ.date}`} className="flex items-center justify-between text-sm">
                  <span>
                    {occ.title}
                    {formatTimeSuffix(occ.time)}
                  </span>
                  <Link
                    href={`/kalender/${occ.eventId}/edit`}
                    className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
                  >
                    Bearbeiten
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Verify the app builds and typechecks**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Manual verification with Playwright**

Start the dev server (`npm run dev`), navigate to `/kalender/new`, create an event with title "Testtermin", today's date, all-day, no recurrence. Navigate to `/kalender` and confirm "Testtermin" appears in today's grid cell, and clicking today's cell shows it in the detail panel below with a working "Bearbeiten" link.

- [ ] **Step 5: Commit**

```bash
git add src/components/CalendarGrid.tsx src/app/kalender/page.tsx
git commit -m "feat: add calendar page with month grid view"
```

---

### Task 7: Calendar page — week view toggle

**Files:**
- Modify: `src/app/kalender/page.tsx`

**Interfaces:**
- Consumes: `weekDays` from `@/lib/domain/calendarGrid` (Task 2, alongside the already-imported `monthGridDays`); the existing `CalendarGrid` component from Task 6 (no prop changes needed — `currentMonth` is simply omitted for week view, `maxVisible` differs).

- [ ] **Step 1: Add the view-mode toggle and week support**

In `src/app/kalender/page.tsx`, change the import line:

```ts
import { monthGridDays } from "@/lib/domain/calendarGrid";
```

to:

```ts
import { monthGridDays, weekDays } from "@/lib/domain/calendarGrid";
```

Add a new format constant near `MONTH_FORMAT`:

```ts
const WEEK_RANGE_FORMAT = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long" });
```

Add view-mode state right after the `selectedDate` state declaration:

```ts
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
```

Replace the `const days = monthGridDays(cursor);` line with:

```ts
  const days = viewMode === "month" ? monthGridDays(cursor) : weekDays(cursor);
```

Replace `goToPreviousMonth` and `goToNextMonth` with view-aware versions:

```ts
  function goToPrevious() {
    setCursor((prev) => {
      const next = new Date(prev);
      if (viewMode === "month") next.setUTCMonth(next.getUTCMonth() - 1);
      else next.setUTCDate(next.getUTCDate() - 7);
      return next;
    });
  }

  function goToNext() {
    setCursor((prev) => {
      const next = new Date(prev);
      if (viewMode === "month") next.setUTCMonth(next.getUTCMonth() + 1);
      else next.setUTCDate(next.getUTCDate() + 7);
      return next;
    });
  }
```

Update the button `onClick` handlers to use the renamed functions:

```tsx
        <button type="button" onClick={goToPrevious} className="rounded-md p-1.5 hover:bg-muted" aria-label="Zurück">
          <ChevronLeft className="size-4" />
        </button>
```

and

```tsx
        <button type="button" onClick={goToNext} className="rounded-md p-1.5 hover:bg-muted" aria-label="Weiter">
          <ChevronRight className="size-4" />
        </button>
```

Replace the header label `<p className="font-medium capitalize">{MONTH_FORMAT.format(cursor)}</p>` with a view-aware label:

```tsx
          <p className="font-medium capitalize">
            {viewMode === "month"
              ? MONTH_FORMAT.format(cursor)
              : `${WEEK_RANGE_FORMAT.format(days[0])} – ${WEEK_RANGE_FORMAT.format(days[6])}`}
          </p>
```

Add a Monat/Woche tab toggle right before the `<CalendarGrid` element, matching the existing tab style from `/todos`:

```tsx
      <div className="inline-flex rounded-lg border bg-muted/50 p-1">
        {(["month", "week"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              viewMode === mode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {mode === "month" ? "Monat" : "Woche"}
          </button>
        ))}
      </div>
```

Update the `<CalendarGrid` props to be view-aware:

```tsx
      <CalendarGrid
        days={days}
        occurrencesByDate={occurrencesByDate}
        currentMonth={viewMode === "month" ? cursor.getUTCMonth() : undefined}
        todayStr={todayStr}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        maxVisible={viewMode === "month" ? 3 : 6}
      />
```

- [ ] **Step 2: Verify the app builds and typechecks**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manual verification with Playwright**

With the dev server running, navigate to `/kalender`, click the "Woche" tab, confirm the grid switches to a single 7-day row with the current week's dates and the header shows a date range instead of a month name. Click "Monat" again and confirm it switches back.

- [ ] **Step 4: Commit**

```bash
git add src/app/kalender/page.tsx
git commit -m "feat: add week view toggle to calendar page"
```

---

### Task 8: Navigation integration

**Files:**
- Modify: `src/components/NavBar.tsx`
- Modify: `src/components/NewMenu.tsx`

**Interfaces:**
- Consumes: the `/kalender` route (Task 6) and `/kalender/new` route (Task 5).

- [ ] **Step 1: Add "Kalender" to the main navigation**

In `src/components/NavBar.tsx`, change the import line:

```ts
import { Home, CalendarDays, BarChart3, Trophy, Settings, Plus } from "lucide-react";
```

to:

```ts
import { Home, CalendarDays, CalendarRange, BarChart3, Trophy, Settings, Plus } from "lucide-react";
```

Change the `LINKS` array to add a new entry after `"/woche"` and before `"/stats"`:

```ts
const LINKS = [
  { href: "/", label: "Heute", icon: Home },
  { href: "/woche", label: "Woche", icon: CalendarDays },
  { href: "/kalender", label: "Kalender", icon: CalendarRange },
  { href: "/stats", label: "Auswertung", icon: BarChart3 },
  { href: "/milestones", label: "Meilensteine", icon: Trophy },
  { href: "/settings", label: "Einstellungen", icon: Settings },
];
```

The mobile tab bar splits `LINKS` as `LINKS.slice(0, 2)` (left of the "Neu" button) and `LINKS.slice(2)` (right of it) — with the new entry inserted at index 2, the left side still shows Heute/Woche and the right side now shows Kalender/Auswertung/Meilensteine/Einstellungen. No further change to `NavBar.tsx` is needed beyond the `LINKS` array edit above.

- [ ] **Step 2: Add "Neuer Termin" to the "Neu +" menu**

In `src/components/NewMenu.tsx`, add a third link inside `PopoverContent`, after the existing "Neues ToDo" link:

```tsx
        <Link
          href="/kalender/new"
          onClick={() => setOpen(false)}
          className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted"
        >
          Neuer Termin
        </Link>
```

- [ ] **Step 3: Verify the app builds and typechecks**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Manual verification with Playwright**

With the dev server running, check both desktop (1440px) and mobile (390px) viewport widths: confirm "Kalender" appears as a nav item/tab and navigates to `/kalender`; confirm the "Neu +" menu (both desktop and mobile trigger) now offers "Neues Ziel", "Neues ToDo", and "Neuer Termin", each navigating correctly and closing the menu.

- [ ] **Step 5: Commit**

```bash
git add src/components/NavBar.tsx src/components/NewMenu.tsx
git commit -m "feat: add calendar to navigation and the new-item menu"
```

---

## Final Verification

- [ ] Run `npm run lint` — expect no errors.
- [ ] Run `npm test` — expect all tests passing.
- [ ] Run `npx tsc --noEmit` — expect no errors.
- [ ] Run `npm run build` — expect a successful production build.
