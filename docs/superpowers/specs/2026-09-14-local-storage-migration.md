# Lokale Datenhaltung statt Server-Konto — Design Spec

Datum: 2026-09-14

## 1. Zusammenfassung

Die App wird von einem serverseitigen Multi-User-Modell (Prisma/PostgreSQL,
NextAuth Credentials-Auth, pro-User isolierte Daten) auf reine
Client-Persistenz umgestellt: jede Person nutzt die App ohne Registrierung,
ihre Daten (Goals, Entries, Categories, Milestones) leben ausschließlich im
eigenen Browser (IndexedDB). Ziel: "frei zugänglich" — die Seite öffnen und
sofort loslegen, kein Login, keine Registrierungsreibung.

Diese Entscheidung wurde nach einer dreiteiligen Agent-Team-Analyse
(Architektur, Skeptiker, UX) getroffen — siehe Abschnitt 6 für die dabei
verworfenen Alternativen und warum.

## 2. Entscheidungen (vom Nutzer nach der Analyse bestätigt)

- **Kein Mehrpersonen-Profil pro Browser.** "Ein Browser = eine Person" ist
  eine bewusst akzeptierte Einschränkung, kein Bug. Zwei Personen, die sich
  ein Gerät teilen, sehen dieselben Daten — das wird in den Einstellungen
  dokumentiert, nicht technisch verhindert.
- **Export/Import (JSON) ist Teil des Umfangs, nicht optional.** Einzige
  Absicherung gegen Datenverlust bei Cache-Löschen, privatem Modus, iOS-
  Safari-Bereinigung oder Gerätewechsel. Ohne das wäre "rein lokal" für ein
  Produkt, dessen Kernversprechen "Fortschritt über Monate verfolgen" ist,
  nicht vertretbar (einhellige Einschätzung aller drei Analysen).
- **Erinnerungen werden rein clientseitig** (Notification API, nur während
  die App/der Tab offen bzw. im Fokus ist). Der bisherige serverseitige
  Cron-Push (`/api/push/send-reminders`, `web-push`, `PushSubscription`-
  Modell) entfällt ersatzlos — ein anonymer Server-Push-Store wäre selbst
  wieder eine Server-Komponente für Nutzdaten, die der Auftrag ausschließt.
  Bewusster Funktionsverzicht: keine Erinnerung bei komplett geschlossenem
  Browser.
- **IndexedDB über Dexie**, nicht localStorage und nicht rohes
  IndexedDB-API. Begründung: `Entry` ist mengenmäßig dominant (ein
  Datensatz pro Goal pro Tag über Jahre), Range-Queries über
  `[goalId+date]` brauchen einen echten Compound-Index; localStorage ist
  synchron, hat ein ~5-10 MB-Limit und nur String-Werte. Dexie reduziert
  IndexedDB-Boilerplate auf eine Promise-/Query-API und bietet
  `dexie-react-hooks` für reaktive Reads, ohne eine neue State-Management-
  Architektur einzuführen.

## 3. Datenmodell (Ersatz für `prisma/schema.prisma`)

Alle Datumsfelder, die einen Kalendertag repräsentieren, werden als
`"YYYY-MM-DD"`-Strings gespeichert (nicht als `Date`-Objekte) — das
entspricht direkt dem `DailyResult.date: string`-Typ, den die gesamte
Domain-Schicht (`src/lib/domain/*`) bereits verwendet, und vermeidet
Structured-Clone-Konvertierung bei jedem Read.

```
CategoryRecord   { id, name, color, icon }
GoalRecord       { id, categoryId, title, description, icon, endDate,
                    type, unit, targetValue, step, periodicity,
                    weeklyThreshold, periodUnit, periodTarget,
                    archived, createdAt }
EntryRecord      { id, goalId, date, done, value }
MilestoneRecord  { id, goalId, type, threshold, achievedAt }
```

Kein `User`-Modell, kein `PushSubscription`-Modell. IDs werden per
`crypto.randomUUID()` erzeugt (keine zusätzliche Dependency nötig, in
allen relevanten Browsern verfügbar).

## 4. Architektur

```
UI-Komponente ('use client')
   → src/lib/storage/{categories,goals,entries,milestones,stats,week}.ts
        - liest/schreibt via Dexie (src/lib/storage/db.ts)
        - ruft unverändert src/lib/domain/*.ts auf
   → src/lib/domain/*.ts (unverändert, bereits Prisma-entkoppelt)
```

Die Domain-Schicht (`streak.ts`, `milestones.ts`, `periodCount.ts`,
`weeklyGoal.ts`, `densify.ts`, `window.ts`, `goalIcons.ts`,
`goalTemplates.ts`) bleibt vollständig unverändert — das ist der
Kernwert der bisherigen Architektur-Entscheidung, reine Funktionen von
Prisma zu entkoppeln.

`src/app/api/**`, `prisma/`, `src/lib/db.ts`, `src/lib/auth.ts`,
`src/lib/push.ts`, `src/middleware.ts`, `next-auth`/`@prisma/client`/
`prisma`/`bcryptjs`/`web-push` werden vollständig entfernt, nicht
stillgelegt — ein halb verdrahtetes Auth-Skelett ist Wartungslast ohne
Nutzen.

## 5. Phasen (jede für sich lauffähig und testbar)

1. **Foundation + Categories + Goals** — Dexie-Schema, Kategorien- und
   Ziel-CRUD ohne abgeleitete Felder (Streak/Fortschritt kommt in Phase 2).
2. **Entries + Milestones + abgeleitete Goal-Felder** — Streak-Berechnung,
   Periodenauswertung, Meilenstein-Vergabe; erweitert `listGoals` um
   `todayEntry`/`periodProgress`/`currentStreak`.
3. **Stats + Week** — Auswertungs- und Wochenansicht-Aggregation.
4. **Export/Import** — JSON-Download/-Upload aller vier Tabellen.
5. **Client-seitige Erinnerungen** — Notification API statt Server-Push.
6. **UI-Umverdrahtung** — jede Seite von `fetch("/api/...")` auf die neuen
   `storage/*`-Funktionen umstellen; Login/Register/Middleware/Abmelden
   entfernen; Einstellungen um "Daten"-Abschnitt (Export/Import, Hinweis
   auf lokale Speicherung) erweitern.
7. **Cleanup** — Prisma/NextAuth/web-push/bcryptjs aus `package.json`,
   `.env*`, `vitest.setup.ts`, `CLAUDE.md`/`PRODUCT.md` entfernen bzw.
   aktualisieren.

Jede Phase bekommt ein eigenes Plan-Dokument nach demselben Muster wie
Phase 1 (siehe `docs/superpowers/plans/2026-09-14-local-storage-phase1-foundation.md`),
statt alles in einen einzigen, unüberschaubaren Plan zu packen.

## 6. Verworfene Alternativen (aus der Agent-Team-Analyse)

- **Automatisches anonymes Server-Konto** (Skeptiker-Vorschlag): würde
  denselben "keine Registrierungsreibung"-Wunsch mit deutlich weniger
  Umbau-Risiko und ohne Datenverlust-Risiko lösen, aber der Nutzer hat
  sich nach Abwägen bewusst für "rein lokal" entschieden. Für's Protokoll
  festgehalten, falls die Datenverlust-Risiken sich später als zu
  gravierend erweisen.
- **Lokales Mehrpersonen-Profil** (UX-Vorschlag): abgelehnt, da "ein
  Browser = eine Person" als akzeptable Einschränkung eingestuft wurde.
- **Rohes IndexedDB-API ohne Dexie**: abgelehnt zugunsten weniger
  Boilerplate; Dexie ist mit ~25 KB eine kleine, weit verbreitete
  Dependency.
- **Anonyme Server-Push-Komponente** für zuverlässige Erinnerungen bei
  geschlossenem Browser: abgelehnt, da das wieder eine Server-Komponente
  für Nutzdaten (Subscriptions) einführen würde.
