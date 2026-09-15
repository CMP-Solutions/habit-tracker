# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Habit/goal tracker (German UI). Next.js App Router + TypeScript, Dexie (IndexedDB) for local-only persistence, Tailwind + shadcn/ui, Recharts. No server account, no login — all data lives in the browser (see `docs/superpowers/specs/2026-09-14-local-storage-migration.md`). Design spec: `docs/superpowers/specs/2026-09-10-habit-tracker-design.md` and `docs/superpowers/specs/2026-09-10-count-per-period-goal-design.md`.

## Commands

```bash
npm run dev            # dev server
npm run build           # production build
npm run lint             # eslint
npm test                   # vitest run (all tests)
npx vitest run <path>   # single test file
npx vitest              # watch mode
```

No database or environment variables to set up — all persistence is client-side IndexedDB (via Dexie).

## Architecture

**Goal model.** A `Goal` is `type: "boolean" | "quantitative"` crossed with `periodicity: "daily" | "weekly" | "count_per_period"`:
- `daily` — success per calendar day (boolean `done`, or `value >= targetValue`).
- `weekly` — success if `weeklyThreshold` days in the calendar week (Mon–Sun) succeed.
- `count_per_period` — success if `periodTarget` successful days occur within a `periodUnit` (`"week"` or `"month"`) window; available for both boolean and quantitative goals.

An `Entry` is one row per `(goalId, date)` (UTC midnight), upserted — re-submitting the same day updates rather than duplicates. Streaks, weekly/period evaluation, and milestone awards are all *derived*, never stored, and recomputed from the entry history on read.

**Domain logic lives in `src/lib/domain/`, decoupled from persistence and Next.js** — pure functions over plain `DailyResult`/`DayEntry` arrays, unit-tested in `__tests__/`:
- `window.ts` — UTC date helpers; all dates are UTC-midnight `Date`s or `"YYYY-MM-DD"` strings, never local time (documented limitation: a day boundary is the browser's UTC day, not the user's).
- `streak.ts` — current/longest streak, total success count over a `DailyResult[]`.
- `weeklyGoal.ts` — groups entries into calendar weeks.
- `periodCount.ts` — `count_per_period` evaluation; groups into weeks or months via `periodBounds`/`groupIntoCalendarPeriods`.
- `densify.ts` — fills gaps in a sparse entry list so streak/heatmap logic sees an unbroken daily sequence.
- `milestones.ts` — `determineNewMilestones` diffs current streak/total-count against `STREAK_THRESHOLDS`/`TOTAL_COUNT_THRESHOLDS` and already-awarded milestones; idempotent per `(goalId, type, threshold)` by application logic (checked against already-awarded milestones before writing), not a storage-level constraint.
- `goalIcons.ts` / `goalTemplates.ts` — curated emoji set and starter goal presets.

**`src/lib/storage/` is the only place domain functions meet persistence** — one file per data domain (`categories.ts`, `goals.ts`, `entries.ts`, `milestones.ts`, `stats.ts`, `week.ts`, `backup.ts`), each reading/writing the single Dexie database (`src/lib/storage/db.ts`) and calling the pure domain functions to derive streaks, period success, and milestones. There is no server, no user account, and no per-user scoping — the whole IndexedDB database belongs to whoever is using that browser. A `Category` still can't be referenced by a `Goal` that doesn't know about it; `goals.ts` validates a given `categoryId` actually exists locally before writing.

**Reminders** (`src/lib/reminders.ts`) are a plain browser `Notification`, shown at most once per day in the evening, only while the app is open — no server, no service worker, no push subscription. This is a deliberate scope limit versus the retired server-push design: there is no way to notify a user whose browser is fully closed.

**Backup** (`src/lib/storage/backup.ts`) is the only way to move data between devices or protect against accidental data loss — `exportData()`/`importData()` serialize/restore all four tables as JSON, wired into Settings → Daten. Import replaces all local data; it never merges.

**Testing.** `src/lib/storage/__tests__/*.test.ts` are integration tests against an in-memory IndexedDB (`fake-indexeddb`, imported via `fake-indexeddb/auto`) — no real browser needed, no shared state between test files. Domain unit tests in `src/lib/domain/__tests__/` need no storage at all.

## Conventions

- All dates that represent a calendar day (not a timestamp) are UTC midnight — use `utcToday`/`parseUtcDateString` from `src/lib/domain/window.ts` rather than constructing `Date`s directly, to avoid local-timezone drift. In `src/lib/storage/*`, records store these as `"YYYY-MM-DD"` strings; convert to `Date` only at the boundary where a domain function requires it.
- Goals are archived, not deleted, to preserve history/stats; only an entry-less goal can be hard-deleted.
- A goal past its `endDate` drops out of "today"/"week" views but stays visible in stats/milestones (filtered at the query level, not by mutating state).
