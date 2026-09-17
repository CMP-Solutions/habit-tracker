# Termine/Ereignisse — Phase A — Design Spec

## Kontext

Im Rahmen der Weiterentwicklung von Ritual über Ziele und ToDos hinaus wurde
eine breite Brainstorming-Session durchgeführt (inkl. Perspektiven aus einem
architect/ux-designer/skeptic-Team). Der Nutzer hat sich bewusst für einen
Strategiewechsel entschieden: Ritual soll nicht nur ein fokussierter
Habit-/ToDo-Tracker bleiben, sondern auch eigenständige neue Inhaltstypen
bekommen — als erstes: ein Kalender für Termine/Ereignisse. Das ist eine
bewusste Abweichung von der bisherigen Positionierung in `PRODUCT.md`
("kein generisches Life-Tracking-Tool"); `PRODUCT.md` sollte nach dieser
Phase entsprechend aktualisiert werden.

Wegen des Umfangs (neues Datenmodell mit Wiederholungslogik + Vereinheitlichung
mit bestehenden Daten + volles Kalenderraster) wurde das Feature in drei
Phasen zerlegt:

- **Phase A** (dieser Spec): eigene Termine, Wiederholung (wöchentlich/jährlich),
  eigenständiges Monats-/Wochenraster. Zeigt noch keine ToDo-Fälligkeiten oder
  Ziel-Erinnerungen.
- **Phase B** (später, eigener Spec): Vereinheitlichung — ToDo-Fälligkeiten und
  Ziel-Erinnerungen zusätzlich im selben Kalender anzeigen, rein lesend aus
  bestehenden Tabellen abgeleitet.
- **Phase C** (später, eigener Spec): Erinnerungen/Benachrichtigungen für
  eigene Termine, analog zum bestehenden Ziel-Reminder-Mechanismus
  (`src/lib/reminders.ts`).

## Ziel dieser Phase

Nutzer können eigenständige Termine (einmalig, wöchentlich oder jährlich
wiederkehrend) anlegen, bearbeiten und löschen, und sehen sie in einem
Monats- bzw. Wochenraster unter einer neuen Kalender-Seite.

## Nicht-Ziele (Phase A)

- Keine Anzeige von ToDo-Fälligkeiten oder Ziel-Erinnerungen im Kalender.
- Keine Benachrichtigungen/Reminder für Termine.
- Keine Einzeltermin-Ausnahmen innerhalb einer Serie (kein "nur dieses eine
  Mal verschieben") — Bearbeiten/Löschen wirkt immer auf die ganze Serie.
- Keine weiteren Wiederholungsmuster als wöchentlich/jährlich (kein täglich,
  kein monatlich, keine komplexen Regeln wie "jeden 2. Dienstag").
- Kein Ort-/Beschreibungsfeld — nur Titel, Datum, ganztägig/Uhrzeit,
  Wiederholung.

## Datenmodell

Neue Tabelle `events`, per Dexie-Version-Bump hinzugefügt (alle bisherigen
Tabellen bleiben in der neuen Version-Definition unverändert, wie beim
`todos`-Bump zuvor):

```ts
export interface EventRecord {
  id: string;
  title: string;
  /** "YYYY-MM-DD", UTC-Konvention wie im Rest der App (siehe window.ts).
   *  Erstes/einziges Vorkommen der Serie. */
  date: string;
  allDay: boolean;
  /** "HH:MM", nur gesetzt wenn !allDay. */
  time: string | null;
  recurrence: "none" | "weekly" | "yearly";
  createdAt: string;
}
```

Dexie-Store-Definition: `events: "id, date"` (Index auf `date` für
Bereichsabfragen bei der Rasterdarstellung).

**Kein neues Konzept für Wiederholungs-Ausnahmen** — es gibt bewusst keine
zweite Tabelle für Ausnahmen/verschobene Einzeltermine (siehe Nicht-Ziele).

## Ableitungslogik (Domain-Layer)

Neue Datei `src/lib/domain/eventOccurrences.ts`, reine Funktionen ohne
Storage-Zugriff, folgt der bestehenden Konvention "nichts Abgeleitetes wird
gespeichert" (vgl. `streak.ts`, `periodCount.ts`):

```ts
export interface EventOccurrence {
  eventId: string;
  title: string;
  date: string; // "YYYY-MM-DD" des konkreten Vorkommens
  allDay: boolean;
  time: string | null;
}

export function occurrencesInRange(
  events: EventRecord[],
  rangeStart: Date, // UTC-Mitternacht, inklusive
  rangeEnd: Date    // UTC-Mitternacht, exklusive
): EventOccurrence[];
```

Regeln pro `recurrence`:
- `"none"`: ein Vorkommen an `date`, falls `rangeStart <= date < rangeEnd`.
- `"weekly"`: ein Vorkommen an jedem Datum mit demselben Wochentag wie `date`,
  für jede Woche ab `date` (nicht davor), die in den Bereich fällt.
- `"yearly"`: ein Vorkommen an jedem `date`-Monat/Tag, für jedes Jahr ab dem
  Jahr von `date`, das in den Bereich fällt. **Edge Case 29. Februar:** fällt
  in einem Nicht-Schaltjahr auf den 28. Februar (dokumentierte, bewusste
  Vereinfachung, kein Datum wird ausgelassen).

Ergebnisse werden aufsteigend nach `date` sortiert zurückgegeben. Ein Event
mit `recurrence !== "none"` kann mehrere Occurrences im selben Bereich
erzeugen (z. B. mehrere Wochen in einem Monat).

## Storage-Layer

Neue Datei `src/lib/storage/events.ts`, nach dem Muster von `todos.ts`:
- `createEvent(input: CreateEventInput): Promise<EventRecord>`
- `getEvent(id: string): Promise<EventRecord | undefined>`
- `updateEvent(id: string, patch: Partial<CreateEventInput>): Promise<EventRecord>`
- `deleteEvent(id: string): Promise<void>`
- `listEvents(): Promise<EventRecord[]>`
- `getOccurrencesForRange(rangeStart: Date, rangeEnd: Date): Promise<EventOccurrence[]>`
  — lädt `listEvents()` und ruft `occurrencesInRange` auf.

Validierung: `title` darf nicht leer sein (getrimmt). `time` nur zulässig,
wenn `allDay === false`; beim Speichern wird `time` auf `null` erzwungen,
falls `allDay === true` (analog zum bestehenden `dueDate`/`dueTime`-Muster
in `todos.ts`).

**Backup/Export-Import** (`src/lib/storage/backup.ts`): `events` wird von
Anfang an in `ExportedData` (als `events?: EventRecord[]`, optional für
Abwärtskompatibilität mit alten Exports), im `isEventRecord`-Validator und
in der `importData`-Transaktion (clear + `bulkAdd`) berücksichtigt — das war
beim ToDo-Feature ein Nacharbeiten in der finalen Review; hier wird es
direkt als reguläre Aufgabe im Implementierungsplan verankert.

## UI

**Neue Seite `/kalender`:**
- Monatsraster als Standardansicht, mit einem einfachen Umschalter auf eine
  Wochenansicht (analog zur bestehenden Tab-Umschaltung z. B. bei
  `/todos`'s Offen/Erledigt-Reiter).
- Jede Tageszelle zeigt bis zu 2–3 Termintitel, darüber hinaus ein "+N
  weitere"-Hinweis. Klick/Tap auf einen Tag öffnet eine Detailliste aller
  Vorkommen dieses Tages (wichtig für mobil, wo Zellen zu schmal für mehrere
  Titel sind).
- Navigation zwischen Monaten/Wochen über Vor-/Zurück-Pfeile plus "Heute"-
  Sprung-Button.

**Formular** (`src/components/EventForm.tsx`, neue Seiten `/kalender/new`
und `/kalender/[id]/edit`, nach dem Muster von `TodoForm.tsx`):
- Titel (Pflichtfeld)
- Datum (Pflichtfeld)
- "Ganztägig"-Checkbox; wenn deaktiviert, zusätzliches Uhrzeit-Feld
- Wiederholung als Toggle-Buttons (Keine / Wöchentlich / Jährlich), im Stil
  von `PriorityToggle`/`StatusToggle`

**Bearbeiten/Löschen** wirkt immer auf die gesamte Serie — es gibt keinen
"nur dieses Vorkommen"-Dialog. Ein Löschen entfernt die eine `EventRecord`-
Zeile, ein Bearbeiten ändert sie direkt.

**Navigation:**
- Neuer Eintrag "Kalender" in `NavBar.tsx`'s `LINKS`-Array (Desktop-Nav und
  mobile Tab-Leiste). Icon: `CalendarRange` oder `CalendarClock` aus
  lucide-react (nicht `CalendarDays`, das ist bereits für "Woche" vergeben).
- Mobile Tab-Leiste wächst dadurch von 6 auf 7 Slots (5 Ziele + Neu-Button →
  6 Ziele + Neu-Button); das ist als bewusst akzeptierter Kompromiss für
  Phase A entschieden, keine Nav-Restrukturierung in diesem Scope.
- "Neu +"-Menü (`NewMenu.tsx`) bekommt einen dritten Eintrag "Neuer Termin"
  → `/kalender/new`.

## Fehlerbehandlung

- Leerer Titel → Validierungsfehler wie bei `TodoForm`/`GoalForm`
  ("Titel darf nicht leer sein"), Formular bleibt bestehen.
- Leerer Zustand: Kalenderseite ohne Termine zeigt weiterhin das volle
  Raster (keine "leere" Sonderansicht nötig, ein Kalender ohne Einträge ist
  selbsterklärend) — Tageszellen sind einfach leer.
- Datenintegrität: `events` referenziert keine andere Tabelle, daher kein
  zusätzliches Referenz-Integritätsrisiko beim Import.

## Testing-Plan

- `src/lib/domain/__tests__/eventOccurrences.test.ts`: reine Unit-Tests ohne
  Storage — `none`/`weekly`/`yearly` je mit Fällen innerhalb, außerhalb und
  am Rand des Bereichs; expliziter 29.-Februar-Fall; ein Event mit
  Startdatum nach `rangeEnd` erzeugt keine Vorkommen; ein `weekly`-Event mit
  mehreren Vorkommen im selben Bereich.
- `src/lib/storage/__tests__/events.test.ts`: Integrationstests gegen
  `fake-indexeddb`, analog zu `todos.test.ts` — CRUD, Validierung
  (leerer Titel, `time` bei `allDay: true` wird verworfen),
  `getOccurrencesForRange` End-to-End.
- `src/lib/storage/__tests__/backup.test.ts`: Erweiterung um Export/Import
  von `events`, inkl. Import eines alten Exports ohne `events`-Feld (leere
  Tabelle danach) — nach demselben Muster wie die bestehenden
  `todos`-Backup-Tests.
- `src/lib/storage/__tests__/db.test.ts`: "opens with the expected tables"-
  Test um `"events"` erweitern.

## Global Constraints für den Implementierungsplan

- Alle Datums-/Zeit-Werte folgen der UTC-Mitternacht-Konvention aus
  `src/lib/domain/window.ts` — keine lokalen `Date`-Konstruktionen.
- `events` wird von Anfang an Teil von `backup.ts` (kein Nacharbeiten nach
  der finalen Review wie beim ToDo-Feature).
- Kein neuer Farb-Token, keine neue Bibliothek für das Kalenderraster —
  reines Tailwind, folgt dem bestehenden minimalistischen Stil.
- Wiederholungsregeln beschränken sich strikt auf `"none" | "weekly" |
  "yearly"` — kein `"daily"`/`"monthly"` in Phase A.
