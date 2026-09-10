# Habit & Goal Tracker — Design Spec

Datum: 2026-09-10

## 1. Zusammenfassung

Eine Web-App zum Tracken wiederkehrender Vorhaben ("Habits"), z.B. "3 Liter
Wasser am Tag trinken" oder "keine Süßigkeiten". Ziele lassen sich als
Tages- oder Wochenziel konfigurieren, Fortschritt wird über Heatmap und
Liniendiagramm visualisiert, und das System vergibt automatisch
Meilensteine für Erfolgsserien (Streaks).

Kein klassisches Einmal-ToDo-Tool — der Fokus liegt auf wiederkehrenden
Gewohnheiten und deren langfristiger Auswertung.

## 2. Tech-Stack

- **Framework**: Next.js (App Router, TypeScript) — Frontend und Backend
  (API-Routes) in einem Projekt
- **Datenbank**: PostgreSQL
- **ORM**: Prisma
- **Auth**: NextAuth.js, Credentials-Provider (E-Mail + Passwort, gehashed
  mit bcrypt)
- **Styling/UI**: Tailwind CSS + shadcn/ui-Komponenten
- **Diagramme**: Recharts (Liniendiagramm) + eigene Heatmap-Komponente
  (SVG/Grid-basiert, angelehnt an GitHub-Contribution-Graph)
- **Deployment-Zielbild**: Vercel (App) + verwaltetes Postgres (z.B. Neon)
  — wird zu gegebener Zeit final entschieden, kein Blocker für die
  Entwicklung

Begründung: ein Repo, ein Deploy, durchgängig TypeScript, volle Kontrolle
über Business-Logik (Streak-Berechnung, Wochenziel-Auswertung,
Meilenstein-Regeln) ohne Vendor-Lock-in.

## 3. Datenmodell

```
User
  id, email, passwordHash, name, createdAt

Category
  id, userId, name, color, icon

Goal
  id, userId, categoryId (nullable)
  title, description
  type: "boolean" | "quantitative"
  unit (nullable, z.B. "Liter", "Minuten") — nur bei quantitative
  targetValue (nullable) — nur bei quantitative, z.B. 3 (Liter)
  periodicity: "daily" | "weekly"
  weeklyThreshold (nullable) — nur bei periodicity=weekly, z.B. 5 (von 7 Tagen)
  archived: boolean
  createdAt

Entry
  id, goalId, date (Tag, ohne Uhrzeit)
  done: boolean (bei type=boolean)
  value: number (nullable, bei type=quantitative)
  unique constraint: (goalId, date)

Milestone
  id, goalId
  type: "streak" | "total_count"
  threshold (z.B. 7, 30, 100)
  achievedAt: datetime
```

**Ableitungen (nicht gespeichert, sondern berechnet):**
- **Tagesstatus eines Goals**: bei boolean = `done`; bei quantitative =
  `value >= targetValue`
- **Wochenstatus eines weekly-Goals**: Anzahl erfolgreicher Tage der
  laufenden/abgeschlossenen Woche >= `weeklyThreshold`
- **Streak**: fortlaufende Serie erfolgreicher Perioden (Tage bei daily,
  Wochen bei weekly), endet beim ersten Fehltag/-woche
- **Milestones** werden bei jedem neuen Entry neu berechnet: erreicht das
  Goal erstmals einen Streak von 7/30/100 (konfigurierbare Schwellen) oder
  eine Gesamtzahl von 100 erfolgreichen Perioden, wird ein Milestone-Eintrag
  erzeugt (idempotent — pro Goal+Schwelle nur einmal)

## 4. Screens

1. **Dashboard** (`/`): heutige Goals gruppiert nach Kategorie, schnelles
   Abhaken (boolean) bzw. Werteingabe (quantitative), Tagesfortschritts-Ring
   oben
2. **Goal-Detail** (`/goals/[id]`): Heatmap-Kalender + Liniendiagramm für
   dieses Goal, aktueller Streak, erreichte Meilensteine, Bearbeiten/Archivieren
3. **Auswertung** (`/stats`): Gesamt-Heatmap über alle Goals, Liniendiagramm
   mit wählbarem Zeitraum (7/30/90 Tage, Jahr), Filter nach Kategorie/Goal
4. **Meilensteine** (`/milestones`): Badge-artige Übersicht erreichter
   Meilensteine, gruppiert nach Goal, chronologisch
5. **Neues Goal** (`/goals/new`): Formular — Titel, Typ, Kategorie, Zielwert
   (falls quantitative), Periodizität, Wochenschwelle (falls weekly)
6. **Einstellungen** (`/settings`): Account-Daten, Kategorien verwalten
   (anlegen/bearbeiten/löschen, Farbe/Icon)
7. **Auth** (`/login`, `/register`): E-Mail/Passwort

## 5. Visuelles Design

- Ruhiges, modernes UI mit viel Weißraum, keine überladenen Screens
- Kategorie-Farben als gezielte Akzente (z.B. farbiger Rand/Icon an Goal-Karten),
  nicht als große Flächen
- Sanfte Mikro-Interaktionen beim Abhaken (kurze Erfolgsanimation/Haptik-Gefühl
  via CSS-Transition)
- Dark-Mode-fähig von Anfang an (Tailwind `dark:`-Varianten)
- Vor der UI-Umsetzung wird gezielt die `frontend-design`-Skill-Guidance
  herangezogen für Typografie, Farbpalette und Layout-Rhythmus, damit das
  Ergebnis nicht wie ein generisches Dashboard-Template wirkt

## 6. Fehlerbehandlung & Edge Cases

- Doppelter Entry für denselben Tag: Upsert (Update statt neuer Zeile) —
  DB unique constraint (goalId, date) erzwingt das
- Nachträgliches Eintragen vergangener Tage: erlaubt (z.B. "gestern
  vergessen einzutragen"), löst Neuberechnung von Streaks/Milestones aus
- Goal wird archiviert statt gelöscht, damit Historie/Statistik erhalten
  bleibt; gelöscht werden kann nur ein Goal ohne Entries
- Zeitzone: Tage werden in der lokalen Zeitzone des Nutzers berechnet
  (Browser-Zeitzone beim Schreiben des Entry-Datums verwendet)

## 7. Testing-Strategie

- Unit-Tests für die Kernlogik: Streak-Berechnung, Wochenziel-Auswertung,
  Milestone-Vergabe (reine Funktionen, gut isoliert testbar — TDD hierfür)
- Integrationstests für API-Routes (Entry anlegen/updaten, Goal CRUD)
- Kein E2E-Testing-Framework im ersten Schritt (YAGNI) — manuelles Testen
  im Browser während der Entwicklung

## 8. Out of Scope (für spätere Iterationen)

- Push-Benachrichtigungen/Reminders
- Social-Features (Freunde, geteilte Ziele, Leaderboards)
- Mobile-native App
- Google-OAuth-Login (nur E-Mail/Passwort im ersten Schritt)
- Nutzerdefinierte Meilensteine (nur automatische Streak-Meilensteine im
  ersten Schritt)
