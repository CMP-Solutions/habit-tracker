# ToDos (Phase A: Grundgerüst)

## Kontext

Ritual deckt bisher nur wiederkehrendes Verhalten ab (Ziele mit Streaks). Aus dem Brainstorming zu
`docs/superpowers/plans/` (Ziel-Erweiterungen) ging hervor, dass einmalige Aufgaben mit Fälligkeitsdatum
("ToDos") ein eigenes, unabhängiges Konzept sind und nicht als weitere Goal-Periodizität modelliert
werden sollten. Dieses Dokument spezifiziert Phase A: das Grundgerüst (Datenmodell, CRUD, Dashboard-
Integration). Kalenderansicht (Phase B) und Erinnerungen pro ToDo (Phase C) sind bewusst nicht Teil
dieser Iteration.

## Ziel

Ein ToDo ist eine einmalige Aufgabe mit optionalem Fälligkeitsdatum und optionaler Priorität, die man
anlegt, abhakt und danach nicht wieder täglich neu erledigen muss (im Gegensatz zu einem Ziel). Sichtbar
sowohl im Dashboard (Kurzübersicht: was ist "dran") als auch auf einer eigenen Seite (volle Liste).

## Datenmodell (`src/lib/storage/db.ts`)

Neue Tabelle, daher ein echter Dexie-Versions-Bump (im Gegensatz zu den rein additiven Feldänderungen
der vorherigen Iteration):

```ts
export interface TodoRecord {
  id: string;
  title: string;
  /** "YYYY-MM-DD" oder null für kein Fälligkeitsdatum. */
  dueDate: string | null;
  /** "HH:mm", nur sinnvoll wenn dueDate gesetzt ist. */
  dueTime: string | null;
  priority: "low" | "normal" | "high" | null;
  done: boolean;
  /** "YYYY-MM-DD" — der Tag, an dem das ToDo angelegt wurde, UTC. */
  createdAt: string;
}
```

```ts
db.version(2).stores({
  categories: "id, name",
  goals: "id, archived, categoryId, createdAt",
  entries: "id, goalId, date, [goalId+date]",
  milestones: "id, goalId, [goalId+type+threshold]",
  todos: "id, done, dueDate",
});
```

Die bestehenden vier Tabellen-Definitionen bleiben unverändert (Dexie migriert automatisch anhand des
Diffs zwischen `version(1)` und `version(2)`; bestehende Daten sind nicht betroffen, da keine
bestehende Tabelle geändert wird — nur eine neue kommt hinzu).

## Storage-Layer (`src/lib/storage/todos.ts`, neu)

```ts
export interface CreateTodoInput {
  title: string;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: "low" | "normal" | "high" | null;
}

export async function createTodo(input: CreateTodoInput): Promise<TodoRecord>;
export async function updateTodo(id: string, patch: Partial<CreateTodoInput> & { done?: boolean }): Promise<TodoRecord>;
export async function deleteTodo(id: string): Promise<void>;

/** Volle Liste, sortiert nach dueDate aufsteigend (null ans Ende). */
export async function listTodos(options?: { includeDone?: boolean }): Promise<TodoRecord[]>;

/**
 * Für das Dashboard: offene ToDos, die "dran" sind — überfällig, heute
 * fällig, oder ganz ohne Fälligkeitsdatum (die sonst nie im Dashboard
 * auftauchen würden). Gleiche Sortierung wie listTodos.
 */
export async function getDashboardTodos(): Promise<TodoRecord[]>;
```

`title` ist Pflicht (nicht-leer), alles andere optional. Validierung analog zu `createGoal`
(`src/lib/storage/goals.ts`): Fehler werfen statt stillschweigend zu korrigieren.

## Dashboard (`src/app/page.tsx`)

Ab dem `sm`-Breakpoint zwei Spalten nebeneinander (Ziele links, ToDos rechts, gleicher Karten-Stil wie
bestehende `GoalCard`s); darunter gestapelt (erst Ziele, dann ToDos) unterhalb `sm`. Die ToDos-Spalte
bekommt eine eigene Kopfzeile analog zur bestehenden Ziele-Kopfzeile: Überschrift "ToDos", ein
"Neues ToDo"-Link (→ `/todos/new`) und einen "Alle anzeigen"-Link (→ `/todos`). Jede Zeile: Checkbox,
Titel, Fälligkeits-Badge (falls gesetzt, rot wenn überfällig), Prioritäts-Badge (falls gesetzt). Abhaken
setzt `done: true` und blendet die Zeile sofort aus der Liste aus (kein Re-Fetch-Delay nötig, optimistic
update wie bei `GoalCard`).

## Volle Liste (`/todos`, neu) + Formulare

`/todos`: Umschalter "Offen" / "Erledigt" (Standard: "Offen", gleiches `ToggleGroup`-Pattern wie in
`GoalForm`), darunter die entsprechend gefilterte Liste (`listTodos({ includeDone: activeTab === "Erledigt" })`
gefolgt von einem Client-seitigen Filter auf `done`, oder zwei separate Aufrufe — Implementierungsdetail
für den Plan). Jede Zeile wie im Dashboard, zusätzlich mit Bearbeiten-Link (→ `/todos/[id]/edit`) und
Löschen (mit Bestätigungsdialog, analog zum bestehenden Lösch-Dialog auf `/goals/[id]/edit`).

`/todos/new` und `/todos/[id]/edit`: eigene Seiten mit einer neuen `TodoForm`-Komponente (Felder: Titel,
Fälligkeitsdatum, Fälligkeitszeit — nur aktiv wenn ein Datum gesetzt ist —, Priorität als
`ToggleGroup`/`Select` mit den drei Stufen plus "keine"), analog zu `GoalForm`/`ExistingGoal`.

## Navigation (`src/components/NavBar.tsx`)

Der bestehende "Neues Ziel"-Link (Desktop-Nav, aktuell `<Link href="/goals/new">Neues Ziel</Link>`) wird
durch einen neuen `NewMenu`-Button ersetzt: Label **"Neu +"**, Klick öffnet ein `Popover` (wie bereits für
die Meilensteine-Medaillen verwendet) mit zwei Einträgen — "Neues Ziel" (→ `/goals/new`) und "Neues ToDo"
(→ `/todos/new`). Der mobile "Neu"-Button in der unteren Tab-Leiste (aktuell ein direkter Link zu
`/goals/new`) bekommt denselben `NewMenu` statt eines direkten Links. Kein neuer Top-Level-Nav-Punkt für
ToDos — sie sind ausschließlich über das Dashboard und den dortigen "Alle anzeigen"-Link erreichbar.

## Out of Scope (bewusst nicht in dieser Iteration)

- Kalenderansicht (Phase B).
- Erinnerungen pro ToDo (Phase C).
- Wiederkehrende ToDos (das wäre wieder ein Ziel).
- Unteraufgaben/Checklisten, Zuweisung an andere Personen.
- Eigener Hauptnav-Punkt für ToDos.
