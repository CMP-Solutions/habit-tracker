"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { createEvent, updateEvent } from "@/lib/storage/events";
import type { EventRecord } from "@/lib/storage/db";

export interface ExistingEvent {
  id: string;
  title: string;
  date: string;
  allDay: boolean;
  time: string | null;
  recurrence: EventRecord["recurrence"];
}

const RECURRENCE_OPTIONS: { value: EventRecord["recurrence"]; label: string }[] = [
  { value: "none", label: "Keine" },
  { value: "weekly", label: "Wöchentlich" },
  { value: "yearly", label: "Jährlich" },
];

function RecurrenceToggle({
  value,
  onChange,
}: {
  value: EventRecord["recurrence"];
  onChange: (v: EventRecord["recurrence"]) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border bg-muted/50 p-1">
      {RECURRENCE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
            value === opt.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function EventForm({ existingEvent }: { existingEvent?: ExistingEvent }) {
  const router = useRouter();
  const [title, setTitle] = useState(existingEvent?.title ?? "");
  const [date, setDate] = useState(existingEvent?.date ?? "");
  const [allDay, setAllDay] = useState(existingEvent?.allDay ?? true);
  const [time, setTime] = useState(existingEvent?.time ?? "");
  const [recurrence, setRecurrence] = useState<EventRecord["recurrence"]>(existingEvent?.recurrence ?? "none");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = {
      title,
      date,
      allDay,
      time: allDay ? null : time || null,
      recurrence,
    };
    try {
      if (existingEvent) {
        await updateEvent(existingEvent.id, input);
      } else {
        await createEvent(input);
      }
      router.push("/kalender");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border bg-card p-6 backdrop-blur-xl">
      <div className="space-y-2">
        <Label htmlFor="title">Titel</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="z.B. Geburtstag Mama"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="date">Datum</Label>
        <Input id="date" type="date" className="font-mono" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="allDay" checked={allDay} onCheckedChange={(checked) => setAllDay(checked === true)} />
        <Label htmlFor="allDay">Ganztägig</Label>
      </div>

      {!allDay && (
        <div className="space-y-2">
          <Label htmlFor="time">Uhrzeit</Label>
          <Input id="time" type="time" className="font-mono" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      )}

      <div className="space-y-2">
        <Label>Wiederholung</Label>
        <RecurrenceToggle value={recurrence} onChange={setRecurrence} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full">
        {existingEvent ? "Speichern" : "Termin anlegen"}
      </Button>
    </form>
  );
}
