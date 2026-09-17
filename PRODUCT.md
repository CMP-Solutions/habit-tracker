# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Anyone who wants to track recurring habits/goals over time — not built as a single-person personal tool, but each person's data lives only in their own browser (no server account, no login): categories, goals, and entries are private to whichever browser recorded them.

## Product Purpose

Started as a tracker for recurring habits and goals ("3 Liter Wasser am Tag", "keine Süßigkeiten"); users check off or log a value per day, and the app derives streaks, period success, and milestones from that history, visualized via heatmap and trend chart. The product has since deliberately grown beyond that single purpose to cover the wider shape of personal organization: one-off ToDos (title, due date, priority, status) sit alongside goals on the dashboard, and a calendar (`/kalender`) tracks one-off and recurring appointments (Termine/Ereignisse) independent of both. Success now means a user can see, at a glance, not just whether they're keeping up a habit, but also what's due and what's coming up.

## Positioning

The habit/goal engine's reason to exist is unchanged: existing habit trackers don't model the specific success rules this product needs — in particular "X times within a calendar period, on any days" (`count_per_period`, e.g. "3x pro Woche Fitness", independent of which weekdays) alongside daily and X-of-7-days weekly goals. Streaks, weekly thresholds, period counts, and milestone rules are custom-built rather than constrained to what an off-the-shelf tracker exposes.

Beyond that engine, the product has explicitly moved away from "just a habit tracker" toward a more holistic personal-organization tool — ToDos and a calendar were added as deliberate, separate content types rather than being force-fit into the goal model, on the reasoning that a single daily "check-in" surface (Ziele + ToDos + Termine on one dashboard) is more useful than three separate apps. This is a conscious departure from an earlier, narrower framing of the product as strictly a recurring-habit tracker with no one-off or calendar content — noted here so future feature decisions read this as the current direction, not as scope creep.

## Operating Context

- Daily use: check in on today's goals (boolean tick or numeric value entry) from a dashboard.
- Periodic review: inspect a single goal's history (heatmap + trend chart) or an overall stats view across goals/categories.
- Occasional setup: create/edit goals and categories, choose type (boolean/quantitative), periodicity (daily/weekly/count_per_period), and — where applicable — thresholds.
- Optional: opt into a browser notification reminder, shown in the evening while the app is open if goals are still unchecked — not a server-sent push, so it can't reach a closed browser.

## Capabilities and Constraints

- No accounts, no login — the app is freely accessible, and all data (goals, categories, entries, milestones, todos, calendar events) lives in IndexedDB in whichever browser is being used. Two people sharing one browser share one dataset; this is an accepted limitation, not a bug (see `docs/superpowers/specs/2026-09-14-local-storage-migration.md`).
- A day is defined by the browser's UTC calendar day, not the user's local timezone — a known, accepted limitation carried over unchanged from the earlier server-based design (documented in `docs/superpowers/specs/2026-09-10-habit-tracker-design.md`).
- Goals are archived, never deleted, once they have entries, to preserve history/stats.
- Milestones (streak thresholds 7/30/100, total-count threshold 100) are automatic only — no user-defined milestones.
- No social features (friends, shared goals, leaderboards) and no native mobile app — web only.

## Evidence on Hand

No real user content, testimonials, or brand assets exist yet — the German-language UI copy in the codebase (goal titles, labels) is the closest thing to real content and should be treated as representative, not literal, copy. No logo or name beyond the working title "habit-tracker-mvp" (package.json).

## Product Principles

- Model habit success precisely (daily / X-of-7-weekly / count-per-period), rather than forcing every habit into a single generic "did you do it" checkbox.
- Derive, don't store: streaks, period success, and milestones are computed from entry history on read, not cached state that can drift.
- Past history is never lost — goals archive instead of delete, backfilled entries recompute derived state rather than being rejected.
- Each browser's data is private to that browser; there is no concept of a user account, and nothing is synced or shared across devices. A manual JSON export/import (Settings → Daten) is the only way to move data between devices or back it up.
