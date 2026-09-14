# "X-mal pro Zeitraum"-Zieltyp — Design Spec

Datum: 2026-09-10

## 1. Zusammenfassung

Ein dritter Periodizitäts-Typ für Ziele: statt täglich oder X-von-7-Tagen
zählt hier "X-mal innerhalb eines festen Kalenderzeitraums" (Woche oder
Monat), unabhängig davon an welchen Tagen. Beispiel: "3x pro Woche
Fitness" — Montag, Mittwoch, Freitag zählt genauso wie drei beliebige
andere Tage in derselben Kalenderwoche.

Existiert eigenständig neben dem bestehenden Wochenziel-Modell (X von 7
Tagen), ersetzt es nicht.

## 2. Datenmodell (Erweiterung des bestehenden Goal-Modells)

```
Goal (Erweiterung)
  periodicity: "daily" | "weekly" | "count_per_period"   // neuer Wert
  periodUnit: "week" | "month" | null                     // nur bei count_per_period
  periodTarget: Int | null                                 // nur bei count_per_period, z.B. 3
```

- Für beide `type`-Werte wählbar (`"boolean"` und `"quantitative"`, seit
  2026-09-14) — bei `type: "quantitative"` bleibt der tägliche
  Zielwert-Mechanismus (`targetValue`/`unit`/`step`) unverändert für die
  Tageserfolg-Ermittlung zuständig, `count_per_period` zählt dann, an wie
  vielen Tagen dieser Tageswert im Zeitraum erreicht wurde (z.B. "3x pro
  Woche 10.000 Schritte").
- `periodUnit`/`periodTarget` sind Pflichtfelder bei
  `periodicity: "count_per_period"`, sonst ungenutzt (kein Reset beim
  Wechsel der Periodizität nötig, da nur bei diesem Typ gelesen).
- Migration ist additiv (neue nullable Spalten), keine bestehenden Daten
  betroffen.

## 3. Domain-Logik

Neues Modul `src/lib/domain/periodCount.ts`, analog zu
`weeklyGoal.ts`:

```typescript
interface DayEntry { date: string; success: boolean }

function groupIntoCalendarPeriods(
  entries: DayEntry[],
  unit: "week" | "month"
): DayEntry[][]
// unit="week": deckt sich mit der bestehenden groupIntoWeeks-Logik
// unit="month": gruppiert nach Kalendermonat (Jahr-Monat als Schlüssel)

function evaluatePeriod(period: DayEntry[], target: number): boolean
// true wenn die Anzahl erfolgreicher Tage im Zeitraum >= target
```

Die bestehenden `calculateCurrentStreak`, `calculateLongestStreak`,
`calculateTotalSuccessCount` (streak.ts) und `determineNewMilestones`
(milestones.ts) werden unverändert wiederverwendet: ein Zeitraum wird wie
eine Woche im bestehenden Wochenziel-Modell behandelt — jede Periode wird
zu einem `DailyResult { date: <Periodenstart>, success: evaluatePeriod(...) }`
verdichtet, und diese Liste läuft durch dieselbe Streak-/Meilenstein-Kette.
Keine Code-Duplikation der Streak-/Meilenstein-Berechnung.

## 4. API-Änderungen

- `POST /api/goals`, `PATCH /api/goals/[id]`: bei
  `periodicity: "count_per_period"` sind `periodUnit` (muss `"week"` oder
  `"month"` sein, sonst 400) und `periodTarget` (positive Ganzzahl, sonst
  400) Pflicht — analog zur bestehenden `weeklyThreshold`-Validierung bei
  `periodicity: "weekly"`.
- `GET /api/goals`: liefert pro `count_per_period`-Ziel zusätzlich
  `periodProgress: { current: number; target: number }` für den
  *aktuellen* Zeitraum (Kalenderwoche/-monat, in dem "heute" liegt),
  berechnet aus den ohnehin für `todayEntry` geladenen Entry-Daten (keine
  zusätzliche Datenbankabfrage).
- `POST /api/entries`: dritter Branch neben `daily`/`weekly` — nutzt
  `groupIntoCalendarPeriods`/`evaluatePeriod` vor der
  Streak-/Meilenstein-Berechnung, identisch zum bestehenden Muster für
  `weekly`-Ziele.

## 5. UI-Änderungen

- **Neues-Ziel-Formular** (`GoalForm`): dritte Periodizitäts-Option
  "X-mal pro Zeitraum", zeigt bei Auswahl zwei zusätzliche Felder
  (Zeitraum: Woche/Monat-Dropdown, Anzahl X). Für beide `type`-Werte
  sichtbar; bei `type = "quantitative"` erscheinen zusätzlich die
  bestehenden Tageszielwert-Felder (Zielmenge/Einheit/Schrittgröße).
- **Dashboard** (`GoalCard`): zeigt bei `count_per_period`-Zielen einen
  Text-Fortschritt unter dem Titel, z.B. "2 von 3 diese Woche", aus dem
  neuen `periodProgress`-Feld.
- **Goal-Detail**: Heatmap/Trendchart zeigen weiterhin einzelne Tage
  (unverändert), wie beim bestehenden Wochenziel-Modell auch — Streaks
  laufen auf Zeitraum-Ebene im Hintergrund.

## 6. Fehlerbehandlung

- Ungültiger `periodUnit`-Wert → 400.
- Fehlender/ungültiger `periodTarget` (≤0 oder kein Integer) → 400.
- Periodizitätswechsel weg von `count_per_period` per PATCH: `periodUnit`/
  `periodTarget` bleiben in der DB stehen, werden aber nicht mehr gelesen
  — kein Datenverlust, kein Validierungszwang beim Wechsel weg.

## 7. Testing-Strategie

- Unit-Tests für `periodCount.ts` (TDD): Wochen-/Monatsgruppierung,
  Schwellenwert-Auswertung — analog zu `weeklyGoal.test.ts`.
- Integrationstest in `src/app/api/entries/route.test.ts`: 2 von 3
  Terminen in einer Kalenderwoche → kein Meilenstein; 3. Termin in
  derselben Woche → Fortschritt korrekt, Zeitraum als erfolgreich
  gewertet.
- Kein E2E-Testing (konsistent mit dem Rest des Projekts).

## 8. Out of Scope

- Gleitende Zeitfenster (z.B. "3x in den letzten 7 Tagen") — nur feste
  Kalenderperioden.
- `count_per_period` für quantitative Ziele.
- Frei wählbare Periodenlängen in Tagen — nur Woche oder Monat.
