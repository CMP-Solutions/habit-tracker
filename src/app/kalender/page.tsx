"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CalendarGrid } from "@/components/CalendarGrid";
import { monthGridDays, weekDays } from "@/lib/domain/calendarGrid";
import { getOccurrencesForRange } from "@/lib/storage/events";
import type { EventOccurrence } from "@/lib/domain/eventOccurrences";
import { utcToday } from "@/lib/domain/window";

const MONTH_FORMAT = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });
const WEEK_RANGE_FORMAT = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", timeZone: "UTC" });
const SELECTED_DAY_FORMAT = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function formatTimeSuffix(time: string | null): string {
  return time ? ` · ${time}` : "";
}

export default function KalenderPage() {
  const todayStr = utcToday().toISOString().slice(0, 10);
  const [cursor, setCursor] = useState<Date>(() => utcToday());
  const [occurrences, setOccurrences] = useState<EventOccurrence[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"month" | "week">("month");

  const days = viewMode === "month" ? monthGridDays(cursor) : weekDays(cursor);

  useEffect(() => {
    const rangeStart = days[0];
    const rangeEnd = new Date(days[days.length - 1]);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
    getOccurrencesForRange(rangeStart, rangeEnd).then(setOccurrences);
    // `days` is deterministically derived from `cursor` and `viewMode` every
    // render, so those two are the effect's true dependencies — not `days`
    // itself, which is a new array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, viewMode]);

  const occurrencesByDate = new Map<string, EventOccurrence[]>();
  for (const occ of occurrences) {
    const list = occurrencesByDate.get(occ.date) ?? [];
    list.push(occ);
    occurrencesByDate.set(occ.date, list);
  }

  function goToPrevious() {
    setSelectedDate(null);
    setCursor((prev) => {
      if (viewMode === "month") {
        return new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() - 1, 1));
      }
      const next = new Date(prev);
      next.setUTCDate(next.getUTCDate() - 7);
      return next;
    });
  }

  function goToNext() {
    setSelectedDate(null);
    setCursor((prev) => {
      if (viewMode === "month") {
        return new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1));
      }
      const next = new Date(prev);
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    });
  }

  const selectedOccurrences = selectedDate ? (occurrencesByDate.get(selectedDate) ?? []) : [];

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl">Kalender</h1>
        <Link href="/kalender/new" className={buttonVariants({ size: "sm" })}>
          <Plus /> Neuer Termin
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <button type="button" onClick={goToPrevious} className="rounded-md p-1.5 hover:bg-muted" aria-label="Zurück">
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex items-center gap-3">
          <p className="font-medium capitalize">
            {viewMode === "month"
              ? MONTH_FORMAT.format(cursor)
              : `${WEEK_RANGE_FORMAT.format(days[0])} – ${WEEK_RANGE_FORMAT.format(days[6])}`}
          </p>
          <button
            type="button"
            onClick={() => setCursor(utcToday())}
            className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            Heute
          </button>
        </div>
        <button type="button" onClick={goToNext} className="rounded-md p-1.5 hover:bg-muted" aria-label="Weiter">
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="inline-flex rounded-lg border bg-muted/50 p-1">
        {(["month", "week"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => {
              setViewMode(mode);
              setSelectedDate(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              viewMode === mode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {mode === "month" ? "Monat" : "Woche"}
          </button>
        ))}
      </div>

      <CalendarGrid
        days={days}
        occurrencesByDate={occurrencesByDate}
        currentMonth={viewMode === "month" ? cursor.getUTCMonth() : undefined}
        todayStr={todayStr}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        maxVisible={viewMode === "month" ? 3 : 6}
      />

      {selectedDate && (
        <div className="space-y-2 rounded-lg border p-4">
          <p className="text-sm font-medium">{SELECTED_DAY_FORMAT.format(new Date(selectedDate + "T00:00:00Z"))}</p>
          {selectedOccurrences.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Termine.</p>
          ) : (
            <ul className="space-y-1">
              {selectedOccurrences.map((occ) => (
                <li key={`${occ.eventId}-${occ.date}`} className="flex items-center justify-between text-sm">
                  <span>
                    {occ.title}
                    {formatTimeSuffix(occ.time)}
                  </span>
                  <Link
                    href={`/kalender/${occ.eventId}/edit`}
                    className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
                  >
                    Bearbeiten
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
