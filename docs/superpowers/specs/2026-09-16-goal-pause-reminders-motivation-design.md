# Ziel-Erweiterungen: Pause-Tage, individuelle Erinnerungen, Motivation

## Kontext

Das bestehende Goal-Feature (`docs/superpowers/specs/2026-09-10-habit-tracker-design.md`) deckt Streaks,
Perioden-Ziele und Milestones ab, hat aber keine Möglichkeit, einen Tag bewusst auszusetzen ohne die
Streak zu verlieren, keine ziel-spezifischen Erinnerungszeiten, und kein Feld für die persönliche
Motivation hinter einem Ziel. Dieses Dokument spezifiziert alle drei Erweiterungen.

## Ziel

- Ein Tag kann als "übersprungen" markiert werden (mit optionalem Grund), ohne die Streak zu brechen.
- Jedes Ziel kann eine eigene Erinnerungszeit bekommen, zusätzlich zur bestehenden generischen
  Abend-Erinnerung.
- Jedes Ziel kann einen optionalen Motivationstext ("Warum") bekommen, sichtbar nur auf der Detailseite.

## Datenmodell (`src/lib/storage/db.ts`)

Kein Dexie-Versions-Bump nötig — IndexedDB erzwingt kein Schema auf unindizierte Felder.

```ts
export interface EntryRecord {
  // ... bestehende Felder unverändert ...
  skipped: boolean;
  skipReason: string | null;
}

export interface GoalRecord {
  // ... bestehende Felder unverändert ...
  reminderTime: string | null; // "HH:mm", 24h
  motivation: string | null;
}
```

Wenn `skipped === true`, sind `done`/`value` bedeutungslos und bleiben `false`/`null`.

## Domain-Layer (`src/lib/domain/streak.ts`, `densify.ts`)

`DailyResult` bekommt ein optionales `skipped?: boolean`. Ein Tag mit `skipped: true` ist für die
Streak-Berechnung "transparent" — er bricht die Streak nicht, erhöht sie aber auch nicht:

```ts
export interface DailyResult {
  date: string;
  success: boolean;
  skipped?: boolean;
}

export function calculateCurrentStreak(results: DailyResult[]): number {
  let streak = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].skipped) continue;
    if (!results[i].success) break;
    streak++;
  }
  return streak;
}

export function calculateLongestStreak(results: DailyResult[]): number {
  let longest = 0;
  let current = 0;
  for (const result of results) {
    if (result.skipped) continue;
    if (result.success) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}
```

`calculateTotalSuccessCount` bleibt unverändert — ein übersprungener Tag hat `success: false` und zählt
damit automatisch nicht mit. Das setzt die Entscheidung um: **Skip schützt nur die Streak, zählt nicht
für Perioden-Fortschritt (`X von Y diese Periode`) oder die "insgesamt X mal"-Medaille.**

`densifyDailyResults` (`src/lib/domain/densify.ts`) muss `skipped` pro Tag durchreichen: Eingabe- und
Ausgabetyp erweitern sich um `skipped: boolean` (Default `false` für Tage ohne Eintrag oder mit
`skipped` nicht gesetzt).

## Storage-Layer — betroffene Call-Sites

Vier Stellen bauen aktuell `{date, success}` aus `EntryRecord`s und müssen `skipped: e.skipped` ergänzen:

1. **`src/lib/storage/entries.ts`** (`recordEntry`) — beim Neuberechnen der Streak/Milestones nach einem
   Eintrag.
2. **`src/lib/storage/goals.ts`** (`listGoalsWithProgress`, `getGoalHistory` o.ä.) — Dashboard-Streak und
   Detailseiten-Historie.
3. **`src/lib/storage/milestones.ts`** (`getMilestones`) — Upcoming-Progress-Berechnung.
4. **`src/lib/storage/week.ts`** (`getWeek`) — `WeekEntry` bekommt `+ skipped: boolean` und
   `+ skipReason: string | null`.

### Neue Funktion: `recordSkip`

In `src/lib/storage/entries.ts`, analog zu `recordEntry`:

```ts
export async function recordSkip(input: {
  goalId: string;
  date: string;
  reason?: string;
}): Promise<{ entry: EntryRecord }> {
  // gleiche Validierung wie recordEntry (goalId, date-Format, Goal existiert)
  // upsert EntryRecord mit skipped: true, skipReason: input.reason ?? null,
  //   done: false, value: null
  // KEINE Milestone-Berechnung — ein Skip kann nie einen Meilenstein auslösen
}
```

## UI — Dashboard (`src/components/GoalCard.tsx`, `src/app/page.tsx`)

Bei einem noch offenen Ziel (weder abgehakt noch Zielwert erreicht) erscheint neben Checkbox/Zahlenfeld
ein dezenter Text-Link "Heute überspringen" (kein Primary-Button). Klick öffnet einen Dialog
(`src/components/ui/dialog.tsx`, bereits vorhanden):

- Überschrift: "Ziel heute überspringen?"
- Motivierender Zwischentext (fix formuliert, keine Zufallsvariation nötig): *"Ein Tag Pause ist völlig
  okay, wenn's einen guten Grund gibt. Aber lass dich nicht von bloßer Antriebslosigkeit abhalten — bleib
  dran!"*
- Optionales Textfeld "Grund (optional)"
- Buttons: "Doch weitermachen" (schließt ohne Aktion) / "Trotzdem überspringen" (ruft `recordSkip` auf,
  schließt Dialog, `onChecked()`/`load()` wie bei normalem Check-in)

Diese Dialog-UI ist für Boolean- und Menge-Ziele identisch (gleicher Button, gleicher Dialog,
unabhängig vom `goal.type`).

Ist ein Ziel für heute übersprungen (`goal.todayEntry?.skipped === true`), zeigt die Karte statt
Checkbox/Input einen grauen "Pausiert"-Zustand mit Rückgängig-Möglichkeit (Klick setzt den Entry wieder
zurück auf einen unentschiedenen Zustand — technisch: Entry löschen oder `skipped: false` mit
`done:false,value:null`, siehe Implementierungsplan für die genaue Wahl).

## UI — Woche-Ansicht (`src/app/woche/page.tsx`)

`WeekCell` bekommt einen dritten Renderpfad: ist `entry.skipped === true`, wird ein Kreis im gleichen
Look wie der abgehakte Boolean-Zustand gerendert, aber mit gedämpfter/grauer statt `celebrate`-Farbe
(z.B. `border-border bg-muted text-muted-foreground` statt `border-celebrate bg-celebrate`). Ist ein
`skipReason` vorhanden, zeigt ein Tooltip/Popover (analog zum bestehenden `Popover`-Pattern aus den
Meilensteinen) den Grund beim Antippen.

## Erinnerungen (`src/lib/reminders.ts`)

`GoalRecord.reminderTime` (`"HH:mm"` oder `null`) wird beim Anlegen/Bearbeiten über ein optionales
Zeitfeld in `GoalForm.tsx` gesetzt.

Neue Funktion, parallel zur bestehenden `shouldNotify`/`maybeShowReminder`:

```ts
export function shouldNotifyForGoal(params: {
  goalTitle: string;
  reminderTime: string | null; // "HH:mm"
  isOpen: boolean; // noch nicht erledigt heute
  enabled: boolean;
  permissionGranted: boolean;
  now: Date;
  lastNotifiedKey: string | null; // z.B. "ritual:goal-reminder-last:<goalId>" -> "YYYY-MM-DD"
  todayKey: string;
}): boolean;
```

Feuert nur, wenn `reminderTime` gesetzt ist, `now` diese Uhrzeit erreicht/überschritten hat, das Ziel
noch offen ist, und heute für dieses Ziel noch nicht benachrichtigt wurde. Die generische
`maybeShowReminder`-Abend-Erinnerung bleibt unverändert als Fallback bestehen (zählt weiterhin alle
offenen Ziele, unabhängig von `reminderTime`).

**Auslösung im Dashboard** (`src/app/page.tsx`): Da es keinen Service Worker gibt, kann dies nur
feuern, während die Seite offen ist. Zusätzlich zum bestehenden Check beim Laden wird ein
`setInterval(60_000)` ergänzt, das pro offenem Ziel mit gesetzter `reminderTime` prüft, ob es Zeit für
eine Benachrichtigung ist — sonst würde eine "14:00"-Erinnerung nur greifen, wenn die Seite zufällig
genau dann neu geladen wird. Der Interval wird beim Unmount der Dashboard-Seite wieder aufgeräumt
(`clearInterval` im Effect-Cleanup).

## Motivation ("Warum") (`GoalForm.tsx`, `src/app/goals/[id]/page.tsx`)

Optionales Freitextfeld "Warum ist dir das wichtig?" beim Anlegen/Bearbeiten. Wird ausschließlich auf
der Detailseite (`/goals/[id]`) angezeigt — nicht im Dashboard, nicht in der Woche-Ansicht, nicht in den
Meilensteinen.

## Testplan (Überblick, Details im Implementierungsplan)

- Domain: `calculateCurrentStreak`/`calculateLongestStreak` mit `skipped`-Tagen (Streak wird weder
  gebrochen noch erhöht; mehrere Skips hintereinander; Skip direkt vor/nach einem echten Fehltag).
- Storage: `recordSkip` erzeugt keinen Milestone, `getWeek`/`getMilestones`/`listGoalsWithProgress`
  geben `skipped`/`skipReason` korrekt durch; ein Skip zählt nicht für Perioden-Fortschritt oder
  Gesamt-Anzahl.
- Reminders: `shouldNotifyForGoal` reine Funktion, analog zu den bestehenden `shouldNotify`-Tests
  (Zeitpunkt, bereits benachrichtigt, Ziel schon erledigt, keine Berechtigung).
- UI: manuelle Playwright-Verifikation (Dialog-Flow, grauer Pausiert-Zustand, Woche-Zelle, Erinnerungs-
  Feld im Formular, Motivation nur auf Detailseite sichtbar) — kein automatisiertes UI-Test-Setup in
  diesem Projekt (siehe bestehende Konvention: Domain/Storage sind getestet, UI wird manuell mit
  Playwright verifiziert).

## Out of Scope (bewusst nicht in dieser Iteration)

- Rückwirkendes Überspringen vergangener Tage in der Woche-Ansicht.
- Skip zählt irgendwo als Erfolg (Perioden-Ziel, Gesamt-Medaille).
- Zufällig variierende Motivationstexte im Skip-Dialog.
- ToDo-Konzept (separates Brainstorming, wird nach Abschluss dieser Ziel-Erweiterungen wieder
  aufgegriffen).
