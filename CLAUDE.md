# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Habit/goal tracker (German UI). Next.js App Router + TypeScript, Prisma/PostgreSQL, NextAuth credentials auth, Tailwind + shadcn/ui, Recharts. Design spec: `docs/superpowers/specs/2026-09-10-habit-tracker-design.md` and `docs/superpowers/specs/2026-09-10-count-per-period-goal-design.md`.

## Commands

```bash
npm run dev            # dev server
npm run build           # production build
npm run lint             # eslint
npm test                   # vitest run (all tests)
npx vitest run <path>   # single test file
npx vitest              # watch mode
npx prisma migrate dev --name <name>   # new migration (after editing prisma/schema.prisma)
npx prisma generate                     # regenerate client after schema changes
```

Requires a local PostgreSQL with two databases: `habit_tracker` (dev, `.env` from `.env.example`) and `habit_tracker_test` (test, `.env.test` from `.env.test.example`). `vitest.setup.ts` refuses to run if `DATABASE_URL` doesn't contain `habit_tracker_test` — this guards against tests truncating the dev database.

## Architecture

**Goal model.** A `Goal` is `type: "boolean" | "quantitative"` crossed with `periodicity: "daily" | "weekly" | "count_per_period"`:
- `daily` — success per calendar day (boolean `done`, or `value >= targetValue`).
- `weekly` — success if `weeklyThreshold` days in the calendar week (Mon–Sun) succeed.
- `count_per_period` — success if `periodTarget` successful days occur within a `periodUnit` (`"week"` or `"month"`) window; available for both boolean and quantitative goals.

An `Entry` is one row per `(goalId, date)` (UTC midnight), upserted — re-submitting the same day updates rather than duplicates. Streaks, weekly/period evaluation, and milestone awards are all *derived*, never stored, and recomputed from the entry history on read.

**Domain logic lives in `src/lib/domain/`, decoupled from Prisma and Next.js** — pure functions over plain `DailyResult`/`DayEntry` arrays, unit-tested in `__tests__/`:
- `window.ts` — UTC date helpers; all dates are UTC-midnight `Date`s or `"YYYY-MM-DD"` strings, never local time (documented limitation: a day boundary is the server's UTC day, not the user's).
- `streak.ts` — current/longest streak, total success count over a `DailyResult[]`.
- `weeklyGoal.ts` — groups entries into calendar weeks.
- `periodCount.ts` — `count_per_period` evaluation; groups into weeks or months via `periodBounds`/`groupIntoCalendarPeriods`.
- `densify.ts` — fills gaps in a sparse entry list so streak/heatmap logic sees an unbroken daily sequence.
- `milestones.ts` — `determineNewMilestones` diffs current streak/total-count against `STREAK_THRESHOLDS`/`TOTAL_COUNT_THRESHOLDS` and already-awarded milestones; idempotent per `(goalId, type, threshold)` (DB-enforced unique constraint).
- `goalIcons.ts` / `goalTemplates.ts` — curated emoji set and starter goal presets.

API routes (`src/app/api/**/route.ts`) are the only place domain functions meet Prisma: fetch entries, map to `DailyResult`/`DayEntry`, call the pure function, persist the result. Every route re-derives auth via `getServerSession(authOptions)` and scopes queries by `session.user.id` — there's no shared request-level auth middleware for data access, only route-level checks (route-based page protection is in `src/middleware.ts`). A `Category` can only be referenced by its owner; routes that accept a `categoryId` re-validate ownership before writing (see `src/app/api/goals/route.ts`).

**Push reminders** (`src/app/api/push/send-reminders/route.ts`) are triggered by an external cron hitting the endpoint with `Authorization: Bearer $CRON_SECRET` — not a user session. `src/lib/push.ts` exposes `pushConfigured` (false when VAPID env vars are absent) so the route can no-op safely.

**Testing.** `route.test.ts` files are integration tests against the real (test) Postgres via Prisma — no mocking. `vitest.config.ts` disables file parallelism because these tests truncate shared tables between runs; keep that in mind when adding new route tests (don't assume isolation across files, do assume it within one file's sequential execution). Domain unit tests in `src/lib/domain/__tests__/` need no DB.

## Conventions

- All dates that represent a calendar day (not a timestamp) are UTC midnight — use `utcToday`/`parseUtcDateString` from `src/lib/domain/window.ts` rather than constructing `Date`s directly, to avoid local-timezone drift.
- Goals are archived, not deleted, to preserve history/stats; only an entry-less goal can be hard-deleted.
- A goal past its `endDate` drops out of "today"/"week" views but stays visible in stats/milestones (filtered at the query level, not by mutating state).
