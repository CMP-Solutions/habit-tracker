"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CalendarGrid } from "@/components/CalendarGrid";
import { monthGridDays } from "@/lib/domain/calendarGrid";
import { getOccurrencesForRange } from "@/lib/storage/events";
import type { EventOccurrence } from "@/lib/domain/eventOccurrences";
import { utcToday } from "@/lib/domain/window";

const MONTH_FORMAT = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });
const SELECTED_DAY_FORMAT = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long" });

function formatTimeSuffix(time: string | null): string {
  return time ? ` · ${time}` : "";
}

export default function KalenderPage() {
  const todayStr = utcToday().toISOString().slice(0, 10);
  const [cursor, setCursor] = useState<Date>(() => utcToday());
  const [occurrences, setOccurrences] = useState<EventOccurrence[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const days = monthGridDays(cursor);

  useEffect(() => {
    const rangeStart = days[0];
    const rangeEnd = new Date(days[days.length - 1]);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
    getOccurrencesForRange(rangeStart, rangeEnd).then(setOccurrences);
    // `days` is recomputed fresh from `cursor` every render; `cursor` is the
    // effect's true dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  const occurrencesByDate = new Map<string, EventOccurrence[]>();
  for (const occ of occurrences) {
    const list = occurrencesByDate.get(occ.date) ?? [];
    list.push(occ);
    occurrencesByDate.set(occ.date, list);
  }

  function goToPreviousMonth() {
    setCursor((prev) => {
      const next = new Date(prev);
      next.setUTCMonth(next.getUTCMonth() - 1);
      return next;
    });
  }

  function goToNextMonth() {
    setCursor((prev) => {
      const next = new Date(prev);
      next.setUTCMonth(next.getUTCMonth() + 1);
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
        <button type="button" onClick={goToPreviousMonth} className="rounded-md p-1.5 hover:bg-muted" aria-label="Vorheriger Monat">
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex items-center gap-3">
          <p className="font-medium capitalize">{MONTH_FORMAT.format(cursor)}</p>
          <button
            type="button"
            onClick={() => setCursor(utcToday())}
            className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            Heute
          </button>
        </div>
        <button type="button" onClick={goToNextMonth} className="rounded-md p-1.5 hover:bg-muted" aria-label="Nächster Monat">
          <ChevronRight className="size-4" />
        </button>
      </div>

      <CalendarGrid
        days={days}
        occurrencesByDate={occurrencesByDate}
        currentMonth={cursor.getUTCMonth()}
        todayStr={todayStr}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        maxVisible={3}
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
