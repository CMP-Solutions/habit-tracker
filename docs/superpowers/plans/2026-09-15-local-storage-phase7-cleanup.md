# Local Storage Migration — Phase 7: Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove everything the old Prisma/PostgreSQL/NextAuth backend left behind now that nothing in the app references it — the old API routes, the database/auth/push library files, the Postgres-only test infrastructure, the now-unused dependencies, and the documentation describing the retired architecture. This is the final phase of the local-storage migration (spec `docs/superpowers/specs/2026-09-14-local-storage-migration.md`); after it, the codebase contains only the client-only architecture.

**Architecture:** Deletion and doc updates only — no new code, no behavior change. A grep across `src/` before writing this plan confirmed every remaining reference to `@/lib/db`, `@/lib/auth`, `@/lib/push`, `@/lib/push-client`, `next-auth`, `@prisma/client`, `web-push`, and `bcryptjs` lives inside the files this plan deletes — nothing in `src/app/**` (pages/components) or `src/lib/storage/**`/`src/lib/domain/**` touches any of them. This phase is safe to execute as straight removal, verified afterward rather than test-first (there is nothing to red/green-test when deleting dead code).

**Tech Stack:** No new dependencies; several are removed.

**Spec:** `docs/superpowers/specs/2026-09-14-local-storage-migration.md`

## Global Constraints

- Do not modify `src/lib/domain/*`, `src/lib/storage/*`, or any file under `src/app/**`/`src/components/**` other than `CLAUDE.md`/`PRODUCT.md` (Task 5) — everything else in the app layer is already fully wired to local storage (Phases 1–6) and needs no changes here.
- Verify with a full command run (`npm test && npx tsc --noEmit && npm run lint && npm run build`) after every deletion task, not just at the end — catching a missed reference immediately, one task at a time, is cheaper than debugging a pile of them after Task 4.
- `npm install`/`npm uninstall` in this environment requires `--legacy-peer-deps` (a pre-existing, unrelated peer-dependency conflict between `vitest@5` and `@types/node`, confirmed earlier in this project's history) — use it for every `npm` dependency-management command in this plan.

---

### Task 1: Delete the old API routes

**Files:**
- Delete: `src/app/api/` (entire directory — every route and its `route.test.ts`)

- [ ] **Step 1: Delete the directory**

```bash
git rm -r src/app/api
```

This removes: `auth/[...nextauth]/route.ts`, `auth/register/route.ts` + `.test.ts`, `categories/route.ts` + `.test.ts`, `entries/route.ts` + `.test.ts`, `goals/route.ts` + `.test.ts`, `goals/[id]/route.ts` + `.test.ts`, `goals/[id]/history/route.ts` + `.test.ts`, `milestones/route.ts` + `.test.ts`, `push/send-reminders/route.ts`, `push/subscribe/route.ts`, `stats/route.ts` + `.test.ts`, `week/route.ts`.

- [ ] **Step 2: Run the full verification suite**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all remaining tests pass (only `src/lib/storage/**` and `src/lib/domain/**` tests remain — the Postgres-backed `route.test.ts` files are gone along with their routes), no type errors, no lint errors. `src/lib/auth.ts` and `src/lib/db.ts` are now unreferenced but still present — that's expected at this point, they're removed in Task 2.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove old Prisma/NextAuth-backed API routes"
```

---

### Task 2: Delete the database, auth, and push library files

**Files:**
- Delete: `prisma/` (entire directory — schema and migrations)
- Delete: `src/lib/db.ts`
- Delete: `src/lib/auth.ts`
- Delete: `src/lib/push.ts`
- Delete: `src/lib/push-client.ts`
- Delete: `public/sw.js`

- [ ] **Step 1: Delete the files**

```bash
git rm -r prisma
git rm src/lib/db.ts src/lib/auth.ts src/lib/push.ts src/lib/push-client.ts public/sw.js
```

- [ ] **Step 2: Run the full verification suite**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: same as Task 1 — no regressions, since nothing outside the files just deleted (and Task 1's routes) ever imported these.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove Prisma schema, db/auth/push library files, and service worker"
```

---

### Task 3: Simplify test and env config

**Files:**
- Delete: `vitest.setup.ts`
- Delete: `.env.example`
- Delete: `.env.test.example`
- Modify: `vitest.config.ts`

**Interfaces:**
- No interfaces — configuration only.

- [ ] **Step 1: Delete the now-unnecessary files**

```bash
git rm vitest.setup.ts .env.example .env.test.example
```

(If a real, gitignored `.env` or `.env.test` file exists locally from earlier development, leave it — only the tracked `.example` templates and the setup script are removed. The app needs no environment variables at all anymore.)

- [ ] **Step 2: Simplify `vitest.config.ts`**

Replace the file's contents:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

This drops the `dotenv` load (no `.env.test` to load anymore), the `setupFiles: ["./vitest.setup.ts"]` entry (file deleted in Step 1), and `fileParallelism: false` — that setting existed solely because the Postgres-backed `route.test.ts` files (deleted in Task 1) truncated shared tables between runs; `storage/*` tests each use an isolated in-memory `fake-indexeddb` per test file, so there's no cross-file state to protect against.

- [ ] **Step 3: Run the full verification suite**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all tests still pass — re-enabling file parallelism must not introduce flakiness; if it does, that means some `storage/*` test relies on cross-file isolation it shouldn't (investigate and fix the test, don't just silently re-add `fileParallelism: false` to hide it).

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts
git commit -m "chore: remove Postgres-only test setup, re-enable file parallelism"
```

---

### Task 4: Remove unused dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (regenerated by `npm`, not hand-edited)

- [ ] **Step 1: Uninstall the dependencies**

```bash
npm uninstall @prisma/client bcryptjs next-auth prisma web-push --legacy-peer-deps
npm uninstall -D @types/bcryptjs @types/web-push dotenv --legacy-peer-deps
```

- [ ] **Step 2: Run the full verification suite**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: everything passes, including a successful production build — this is the first time in the whole migration `npm run build` is run, and it's the strongest signal that nothing still expects the removed packages to be resolvable (a missing-module error here would show up at build time even if `tsc`/tests miss it, e.g. inside a Next.js server-only code path).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove Prisma, NextAuth, bcryptjs, web-push dependencies"
```

---

### Task 5: Update CLAUDE.md and PRODUCT.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `PRODUCT.md`

- [ ] **Step 1: Rewrite `CLAUDE.md`'s Project, Commands, Architecture, and Testing sections**

Replace the `## Project` line:

```md
Habit/goal tracker (German UI). Next.js App Router + TypeScript, Dexie (IndexedDB) for local-only persistence, Tailwind + shadcn/ui, Recharts. No server account, no login — all data lives in the browser (see `docs/superpowers/specs/2026-09-14-local-storage-migration.md`). Design spec: `docs/superpowers/specs/2026-09-10-habit-tracker-design.md` and `docs/superpowers/specs/2026-09-10-count-per-period-goal-design.md`.
```

Replace the `## Commands` section:

```md
## Commands

\`\`\`bash
npm run dev            # dev server
npm run build           # production build
npm run lint             # eslint
npm test                   # vitest run (all tests)
npx vitest run <path>   # single test file
npx vitest              # watch mode
\`\`\`

No database or environment variables to set up — all persistence is client-side IndexedDB (via Dexie).
```

Replace the paragraph after the Goal-model bullets (currently starting "An `Entry` is one row...") — keep it as-is, it's still accurate — but replace the two paragraphs that follow it (the "Domain logic lives in..." intro sentence stays; only the sentence "decoupled from Prisma and Next.js" needs a wording fix since there's no Prisma to be decoupled from anymore):

```md
**Domain logic lives in `src/lib/domain/`, decoupled from persistence and Next.js** — pure functions over plain `DailyResult`/`DayEntry` arrays, unit-tested in `__tests__/`:
```

(keep the existing bullet list under this line unchanged)

Replace the paragraph starting "API routes (`src/app/api/**/route.ts`) are the only place domain functions meet Prisma...":

```md
**`src/lib/storage/` is the only place domain functions meet persistence** — one file per data domain (`categories.ts`, `goals.ts`, `entries.ts`, `milestones.ts`, `stats.ts`, `week.ts`, `backup.ts`), each reading/writing the single Dexie database (`src/lib/storage/db.ts`) and calling the pure domain functions to derive streaks, period success, and milestones. There is no server, no user account, and no per-user scoping — the whole IndexedDB database belongs to whoever is using that browser. A `Category` still can't be referenced by a `Goal` that doesn't know about it; `goals.ts` validates a given `categoryId` actually exists locally before writing.
```

Replace the paragraph starting "**Push reminders**...":

```md
**Reminders** (`src/lib/reminders.ts`) are a plain browser `Notification`, shown at most once per day in the evening, only while the app is open — no server, no service worker, no push subscription. This is a deliberate scope limit versus the retired server-push design: there is no way to notify a user whose browser is fully closed.
```

Replace the paragraph starting "**Testing.** `route.test.ts` files...":

```md
**Testing.** `src/lib/storage/__tests__/*.test.ts` are integration tests against an in-memory IndexedDB (`fake-indexeddb`, imported via `fake-indexeddb/auto`) — no real browser needed, no shared state between test files. Domain unit tests in `src/lib/domain/__tests__/` need no storage at all.
```

- [ ] **Step 2: Update `PRODUCT.md`**

In `## Users`, replace:

```md
Anyone who wants to track recurring habits/goals over time — not built as a single-person personal tool, but each person's data lives only in their own browser (no server account, no login): categories, goals, and entries are private to whichever browser recorded them.
```

In `## Operating Context`, replace the "Optional: opt into push reminders..." bullet:

```md
- Optional: opt into a browser notification reminder, shown in the evening while the app is open if goals are still unchecked — not a server-sent push, so it can't reach a closed browser.
```

In `## Capabilities and Constraints`, replace the "Auth:" bullet:

```md
- No accounts, no login — the app is freely accessible, and all data (goals, categories, entries, milestones) lives in IndexedDB in whichever browser is being used. Two people sharing one browser share one dataset; this is an accepted limitation, not a bug (see `docs/superpowers/specs/2026-09-14-local-storage-migration.md`).
- A day is defined by the browser's UTC calendar day, not the user's local timezone — a known, accepted limitation carried over unchanged from the earlier server-based design (documented in `docs/superpowers/specs/2026-09-10-habit-tracker-design.md`).
```

(the second bullet replaces the old "A day is defined by the server's UTC calendar day..." line — same limitation, just relocated from server to browser)

In `## Product Principles`, replace the last bullet:

```md
- Each browser's data is private to that browser; there is no concept of a user account, and nothing is synced or shared across devices. A manual JSON export/import (Settings → Daten) is the only way to move data between devices or back it up.
```

- [ ] **Step 3: Run the full verification suite one more time**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: unaffected by doc-only changes — same pass as Task 4, confirming the docs edit introduced no accidental code change.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md PRODUCT.md
git commit -m "docs: update CLAUDE.md and PRODUCT.md for the local-only architecture"
```

---

### Task 6: Final end-to-end verification

**Files:** none — verification only.

- [ ] **Step 1: Run the complete automated verification suite**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass, confirming the whole migration (Phases 1–7) leaves the codebase in a fully working, fully clean state.

- [ ] **Step 2: Playwright smoke test of the whole app**

Start the dev server (`npm run dev`) and, in a single pass, visit every page — `/`, `/woche`, `/stats`, `/milestones`, `/settings`, `/goals/new`, an existing goal's `/goals/[id]` and `/goals/[id]/edit` — confirming each loads without a console error and without any network request to a `/api/*` path (the app should now make zero server calls for its own data). Confirm `/login` and `/register` still 404. Screenshot the Dashboard at 1440px and 390px as the final before/after record of the migration.

- [ ] **Step 3: Report completion**

Summarize for the user: what changed across all 7 phases, how it was verified, and that the app is now fully local-only with no server dependency for its data. This is the natural point to ask whether to proceed with `finishing-a-development-branch` (merge/PR) for the whole migration, since — unlike Phases 1–6 — there is no Phase 8 to keep the branch open for.

---

## Self-Review Notes

- **Spec coverage:** Spec §4 ("`src/app/api/**`, `prisma/`, `src/lib/db.ts`, `src/lib/auth.ts`, `src/lib/push.ts`, `src/middleware.ts`, `next-auth`/`@prisma/client`/`prisma`/`bcryptjs`/`web-push` werden vollständig entfernt") → Tasks 1, 2, 4 (`src/middleware.ts` was already removed in Phase 6b, not repeated here). Spec §5 Phase 7 ("Prisma/NextAuth/web-push aus package.json, .env*, vitest.setup.ts, CLAUDE.md/PRODUCT.md entfernen bzw. aktualisieren") → Tasks 3, 4, 5 cover exactly this.
- **Placeholder scan:** none — every deletion lists exact paths (confirmed via `git rm -r`/`git rm` against a grep-verified reference list, not "clean up unused files"), every doc replacement is the literal new text, not a description of what to write.
- **Type consistency:** N/A — this phase deletes and documents, it introduces no new types or function signatures for later phases to consume.

## What's left after this phase

Nothing — this is the last phase of the migration. The app has zero server dependency for its own data, zero login, and a codebase where every remaining file is either UI, the `storage/*`/`domain/*` layer, or genuinely unrelated tooling (ESLint, Tailwind, Next.js itself).
