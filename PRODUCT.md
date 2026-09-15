# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Anyone who wants to track recurring habits/goals over time — not built as a single-person personal tool, but each person's data lives only in their own browser (no server account, no login): categories, goals, and entries are private to whichever browser recorded them.

## Product Purpose

Tracks recurring habits and goals ("3 Liter Wasser am Tag", "keine Süßigkeiten") rather than one-off to-dos. Users check off or log a value per day; the app derives streaks, period success, and milestones from that history and visualizes progress via heatmap and trend chart. Success means a user can see, at a glance, whether they're keeping up a habit and how far a streak has run.

## Positioning

Existing habit trackers (and general tools like Apple Health or a notes app) don't model the specific success rules this product needs — in particular "X times within a calendar period, on any days" (`count_per_period`, e.g. "3x pro Woche Fitness", independent of which weekdays) alongside daily and X-of-7-days weekly goals. The product's reason to exist is full control over this evaluation logic — streaks, weekly thresholds, period counts, and milestone rules are custom-built rather than constrained to what an off-the-shelf tracker exposes.

## Operating Context

- Daily use: check in on today's goals (boolean tick or numeric value entry) from a dashboard.
- Periodic review: inspect a single goal's history (heatmap + trend chart) or an overall stats view across goals/categories.
- Occasional setup: create/edit goals and categories, choose type (boolean/quantitative), periodicity (daily/weekly/count_per_period), and — where applicable — thresholds.
- Optional: opt into a browser notification reminder, shown in the evening while the app is open if goals are still unchecked — not a server-sent push, so it can't reach a closed browser.

## Capabilities and Constraints

- No accounts, no login — the app is freely accessible, and all data (goals, categories, entries, milestones) lives in IndexedDB in whichever browser is being used. Two people sharing one browser share one dataset; this is an accepted limitation, not a bug (see `docs/superpowers/specs/2026-09-14-local-storage-migration.md`).
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
