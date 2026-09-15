# Local Storage Migration — Phase 6b: UI Wiring — Auswertung, Meilensteine, Settings, Auth Removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the UI-wiring half of the migration: rewire Auswertung and Meilensteine to the local storage layer, rewire Settings (categories + reminders) and add its new "Daten" export/import section, then remove the reachable auth surface (NavBar's Abmelden buttons, `/login`, `/register`, `src/middleware.ts`, `SessionProviderWrapper`). After this phase the app is fully usable, end to end, with zero login and zero required server calls — only Phase 7's dependency/file cleanup (Prisma, NextAuth, old API routes, `package.json`) remains.

**Architecture:** Same pattern as Phase 6a — pages swap `fetch("/api/...")` for direct `storage/*`/`reminders.ts` calls. The auth-removal task deletes files outright rather than swapping their contents, since there is nothing to port (no login/registration/session concept survives this migration).

**Tech Stack:** No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-14-local-storage-migration.md`

## Global Constraints

- Do not modify `src/lib/domain/*`, `src/app/api/**`, `prisma/`, `src/lib/db.ts`, `src/lib/auth.ts`, `src/app/api/auth/**`, `src/lib/push.ts`, `src/lib/push-client.ts`, `public/sw.js`, or `package.json` — these are Phase 7's responsibility. `src/lib/auth.ts` in particular must stay: every not-yet-deleted `src/app/api/**/route.ts` still calls `getServerSession(authOptions)`, so removing it now would break the still-coexisting old backend before Phase 7 retires it.
- This codebase has no existing unit or component tests for pages (see Phase 6a's Global Constraints) — verification is Playwright/manual, per this project's established rule, except for Task 3's `handleExport`/`handleImportFile`, which call `storage/backup.ts` functions that are already unit-tested; no new unit tests are added for the page glue itself, consistent with Phase 6a's precedent.
- Deleting `/login`, `/register`, and `src/middleware.ts` in Task 4 means the app becomes reachable with zero authentication from that point on for anyone testing it — this is not a regression to flag, it is the explicit goal of the whole migration (spec §1, "frei zugänglich ... kein Login").
- The Settings "Daten" section's import must warn the user before replacing local data, per Phase 4's Global Constraints ("Phase 6 muss das beim Import-Button entsprechend deutlich machen, bevor er ausgelöst wird") — implemented here as a plain `window.confirm` rather than a styled dialog component, to keep this task's scope to wiring rather than new UI chrome; upgrading it to a proper `Dialog` (matching the goal-delete confirmation's pattern) is a reasonable follow-up but not required for this migration to be complete.

---

### Task 1: Wire Auswertung (stats)

**Files:**
- Modify: `src/app/stats/page.tsx`

**Interfaces:**
- Consumes: `getStats` from `@/lib/storage/stats`.

- [ ] **Step 1: Replace the data layer in `src/app/stats/page.tsx`**

Add the import: `import { getStats } from "@/lib/storage/stats";` Replace both `fetch(...)` calls:

```ts
  useEffect(() => {
    getStats(trendDays).then((json) => {
      setError(null);
      setTrendData(json);
    });
  }, [trendDays]);

  useEffect(() => {
    getStats(365).then((json) => setHeatmapData(json));
  }, []);
```

(The old code's error branch handled a non-2xx response; `getStats` never throws for a bad `days` value — it already clamps to 30 internally — so the `try`/`catch`-free `.then()` form above is sufficient. Remove the now-unused `error`/`setError` state only if nothing else in the file sets it — check before removing; if the JSX still renders `{error && ...}` for a genuinely reachable case, keep the state and simply never set it to non-null here, since a future re-add of error handling is cheap and an unused branch is harmless.)

- [ ] **Step 2: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Verify in the browser with Playwright**

Navigate to `/stats`. Confirm the heatmap (always 365 days), trend chart, and week summary render with real local data; switching the 7T/30T/90T/365T range updates only the trend, not the heatmap (this was a fixed bug earlier in the project — confirm it's still fixed after the rewiring). Screenshot at 1440px and 390px.

- [ ] **Step 4: Commit**

```bash
git add src/app/stats/page.tsx
git commit -m "feat: wire Auswertung page to local storage (getStats)"
```

---

### Task 2: Wire Meilensteine

**Files:**
- Modify: `src/app/milestones/page.tsx`

**Interfaces:**
- Consumes: `getMilestones` from `@/lib/storage/milestones`.

- [ ] **Step 1: Replace the data layer in `src/app/milestones/page.tsx`**

Add the import: `import { getMilestones } from "@/lib/storage/milestones";` Replace the `fetch("/api/milestones")` effect:

```ts
  useEffect(() => {
    getMilestones().then((json) => {
      setError(null);
      setData(json);
    });
  }, []);
```

The page's local `MilestonesResponse`/`AchievedMilestone`/`UpcomingMilestone` interfaces can stay as-is or be replaced by `getMilestones`'s own `AchievedMilestoneView`/`UpcomingMilestoneView` return type — check field-for-field compatibility first (Phase 2's `milestones.ts` was deliberately shaped to match this page); if they match exactly, importing the storage types instead of keeping duplicate local ones is the cleaner choice.

- [ ] **Step 2: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Verify in the browser with Playwright**

Navigate to `/milestones`. Confirm the "Als Nächstes" progress list and the "Erreicht" list both render with real local data and the same sorting/formatting as before. Screenshot at 1440px and 390px.

- [ ] **Step 4: Commit**

```bash
git add src/app/milestones/page.tsx
git commit -m "feat: wire Meilensteine page to local storage (getMilestones)"
```

---

### Task 3: Wire Settings (categories + reminders) and add the Daten section

**Files:**
- Modify: `src/app/settings/page.tsx`

**Interfaces:**
- Consumes: `listCategories`, `createCategory` from `@/lib/storage/categories`; `isRemindersEnabled`, `enableReminders`, `disableReminders` from `@/lib/reminders`; `exportData`, `importData` from `@/lib/storage/backup`.

- [ ] **Step 1: Replace the categories and reminders wiring in `src/app/settings/page.tsx`**

Replace the imports:

```ts
import { listCategories, createCategory } from "@/lib/storage/categories";
import { isRemindersEnabled, enableReminders, disableReminders } from "@/lib/reminders";
import { exportData, importData } from "@/lib/storage/backup";
```

(remove the `import { getExistingPushSubscription, subscribeToPush, unsubscribeFromPush } from "@/lib/push-client";` line)

Replace the reminders state and effect — `isRemindersEnabled()` is synchronous now, so the three-state loading pattern (`boolean | null`) is no longer needed:

```ts
  const [pushSubscribed, setPushSubscribed] = useState(() => isRemindersEnabled());
  const [pushError, setPushError] = useState<string | null>(null);

  async function togglePush() {
    setPushError(null);
    try {
      if (pushSubscribed) {
        disableReminders();
        setPushSubscribed(false);
      } else {
        await enableReminders();
        setPushSubscribed(true);
      }
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Erinnerungen konnten nicht aktiviert werden.");
    }
  }
```

Remove the button's `disabled={pushSubscribed === null}` prop in the JSX (there's no more loading state to gate on) — leave the rest of that button and its label unchanged.

Replace the categories `load`/`addCategory` functions:

```ts
  function load() {
    listCategories().then(setCategories);
  }

  useEffect(load, []);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createCategory({ name, color, icon: "tag" });
      setError(null);
      setName("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kategorie konnte nicht angelegt werden.");
    }
  }
```

- [ ] **Step 2: Add the "Daten" section**

Add these imports: `import { useRef } from "react";` (merge into the existing React import if there already is one) and the icon `import { Download, Upload } from "lucide-react";` if you want icons on the buttons (optional — the existing category/reminder sections in this file use no icons on their buttons, so plain text buttons are more consistent; skip the icon import if you match that style).

Add this state near the other `useState` calls:

```ts
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
```

Add these handlers:

```ts
  async function handleExport() {
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ritual-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError(null);
    setImportSuccess(false);
    if (!window.confirm("Import ersetzt alle aktuell auf diesem Gerät gespeicherten Daten. Fortfahren?")) return;

    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setImportError("Die Datei ist kein gültiges JSON.");
      return;
    }
    try {
      await importData(parsed);
      setImportSuccess(true);
      load();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import fehlgeschlagen.");
    }
  }
```

Add this section to the JSX, after the existing "Erinnerungen" `<section>` and before `</main>`:

```tsx
      <section className="space-y-3 rounded-xl border bg-card p-6 backdrop-blur-xl">
        <h2 className="text-sm font-medium text-muted-foreground">Daten</h2>
        <p className="text-sm text-foreground">
          Deine Daten liegen nur in diesem Browser. Für ein Backup oder einen Gerätewechsel: exportieren und auf
          dem neuen Gerät wieder einlesen.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            Daten exportieren
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            Daten importieren
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
        {importSuccess && <p className="text-sm text-primary">Import erfolgreich.</p>}
        {importError && <p className="text-sm text-destructive">{importError}</p>}
      </section>
```

- [ ] **Step 3: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Verify in the browser with Playwright**

Navigate to `/settings`. Add a category — confirm it appears in the list without a page reload. Toggle "Aktivieren" on Erinnerungen — a browser permission prompt should appear (grant it in the test environment if possible, or confirm the button state still flips correctly if the prompt can't be interacted with headlessly); toggle it off and confirm it reverts to "Aktivieren". Click "Daten exportieren" and confirm a `ritual-backup-<date>.json` file download is triggered (check via `browser_network_requests` or the download event, since headless Playwright may not surface a visible download dialog). Click "Daten importieren", select a previously exported file, confirm the browser confirm dialog appears, accept it, and confirm categories reload correctly afterward. Screenshot at 1440px and 390px.

- [ ] **Step 5: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "feat: wire Settings to local storage (categories, reminders, export/import)"
```

---

### Task 4: Remove the auth surface

**Files:**
- Modify: `src/components/NavBar.tsx`
- Modify: `src/app/layout.tsx`
- Delete: `src/app/login/page.tsx`
- Delete: `src/app/register/page.tsx`
- Delete: `src/middleware.ts`
- Delete: `src/components/SessionProviderWrapper.tsx`

**Interfaces:**
- No new interfaces — this task removes code, it adds none.

- [ ] **Step 1: Remove the Abmelden buttons from `src/components/NavBar.tsx`**

Change the import line from:

```ts
import { Home, CalendarDays, BarChart3, Trophy, Settings, LogOut, Plus } from "lucide-react";
```

to:

```ts
import { Home, CalendarDays, BarChart3, Trophy, Settings, Plus } from "lucide-react";
```

Remove the `import { signOut } from "next-auth/react";` line entirely.

Remove the `if (pathname === "/login" || pathname === "/register") return null;` line — those routes no longer exist, so this guard is dead code.

In the desktop `<nav>`, remove the entire Abmelden `<Button>`:

```tsx
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => signOut({ callbackUrl: "/login" })}>
          Abmelden
        </Button>
```

In the phone compact top bar `<nav>`, remove the Abmelden `<Button>` and simplify that nav to just the wordmark:

```tsx
      <nav className="sticky top-0 z-40 flex items-center justify-between border-b bg-card/60 px-4 py-3 backdrop-blur-xl sm:hidden">
        <span className="font-heading text-lg text-foreground">Ritual</span>
      </nav>
```

- [ ] **Step 2: Remove `SessionProviderWrapper` from `src/app/layout.tsx`**

Remove the import line: `import { SessionProviderWrapper } from "@/components/SessionProviderWrapper";`

Replace the body:

```tsx
      <body className="min-h-full flex flex-col">
        <AuroraBackground />
        <NavBar />
        {/* Bottom padding clears the fixed mobile tab bar (see NavBar). */}
        <div className="pb-16 sm:pb-0">{children}</div>
      </body>
```

- [ ] **Step 3: Delete the now-dead files**

```bash
git rm src/app/login/page.tsx src/app/register/page.tsx src/middleware.ts src/components/SessionProviderWrapper.tsx
```

(If `src/app/login/` or `src/app/register/` become empty directories after this, that's fine — Next.js doesn't require route directories to exist for routes that no longer do.)

- [ ] **Step 4: Run the full test suite, typecheck, and lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all tests still pass (this task touches no `storage/*` code, so the count is unchanged from Task 3), no type errors, no lint errors.

- [ ] **Step 5: Verify in the browser with Playwright**

Navigate to `/` in a fresh browser context (or clear cookies first) — confirm it loads the Dashboard directly, with no redirect to a login page (there is none) and no "Abmelden" button anywhere in the nav, on both desktop (1440px) and phone (390px) widths. Navigate directly to `/login` and `/register` and confirm they now 404 (expected — the routes are gone). Confirm no console errors from the removed `SessionProviderWrapper`/middleware.

- [ ] **Step 6: Commit**

```bash
git add src/components/NavBar.tsx src/app/layout.tsx
git commit -m "feat: remove auth surface (Abmelden, login/register pages, middleware, SessionProviderWrapper)"
```

---

## Self-Review Notes

- **Spec coverage:** Spec §5 Phase 6's remaining scope ("Auswertung, Meilensteine, Einstellungen um 'Daten'-Abschnitt erweitern; Login/Register/Middleware/Abmelden entfernen") → Tasks 1–4 cover exactly this. The Daten section (Task 3) fulfills spec §2's non-negotiable export/import requirement at the UI layer, completing what Phase 4 only built as a storage function.
- **Placeholder scan:** none — every step has runnable code; Playwright verification steps are manual actions, matching this codebase's established practice (see Phase 6a's Self-Review Notes for why this isn't a placeholder).
- **Type consistency:** Task 1 and Task 2 reuse `getStats`'s and `getMilestones`'s exact return shapes from Phases 2–3, already confirmed field-compatible with each page's existing local interfaces when those phases were planned. Task 3's `exportData`/`importData` are used exactly as Phase 4 exported them, with no wrapper types needed since the page only serializes/deserializes JSON around them.

## What Phase 7 needs from this phase (for the next plan document)

- After this phase, nothing in `src/app/**` or `src/components/**` references `next-auth`, `@/lib/db`, `@/lib/auth`, `@/lib/push`, or `@/lib/push-client` except the old `src/app/api/**/route.ts` files themselves and `src/app/api/auth/**`/`src/app/api/push/**` — Phase 7 can delete `src/app/api/**` in its entirety (including the auth and push sub-routes), then `prisma/`, `src/lib/db.ts`, `src/lib/auth.ts`, `src/lib/push.ts`, `src/lib/push-client.ts`, `public/sw.js`, and the corresponding `package.json` dependencies, `.env*` entries, and `vitest.setup.ts`, without anything in the app layer breaking.
- Every `route.test.ts` file under `src/app/api/**` becomes dead weight the moment its route is deleted — Phase 7 removes them together with their routes, which is also when the still-running Postgres-backed test suite (currently ~83 of the 155 passing tests) finally shrinks to just the `storage/*` and `domain/*` tests.
