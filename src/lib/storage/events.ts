import { db, type EventRecord } from "./db";
import { generateId } from "./id";
import { utcToday } from "@/lib/domain/window";
import { occurrencesInRange, type EventOccurrence } from "@/lib/domain/eventOccurrences";

function todayString(): string {
  return utcToday().toISOString().slice(0, 10);
}

export interface CreateEventInput {
  title: string;
  date: string;
  allDay: boolean;
  time?: string | null;
  recurrence: "none" | "weekly" | "yearly";
}

export async function createEvent(input: CreateEventInput): Promise<EventRecord> {
  if (!input.title || !input.title.trim()) {
    throw new Error("title is required.");
  }
  const event: EventRecord = {
    id: generateId(),
    title: input.title.trim(),
    date: input.date,
    allDay: input.allDay,
    time: input.allDay ? null : (input.time ?? null),
    recurrence: input.recurrence,
    createdAt: todayString(),
  };
  await db.events.add(event);
  return event;
}

export async function getEvent(id: string): Promise<EventRecord> {
  const event = await db.events.get(id);
  if (!event) throw new Error("Not found");
  return event;
}

export async function updateEvent(id: string, patch: Partial<CreateEventInput>): Promise<EventRecord> {
  const existing = await db.events.get(id);
  if (!existing) throw new Error("Not found");
  if (patch.title !== undefined && !patch.title.trim()) {
    throw new Error("title is required.");
  }
  const changes: Partial<EventRecord> = { ...patch };
  if (patch.title !== undefined) changes.title = patch.title.trim();

  const allDay = patch.allDay ?? existing.allDay;
  if (allDay) {
    changes.time = null;
  } else if (patch.time !== undefined) {
    changes.time = patch.time;
  }

  await db.events.update(id, changes);
  return (await db.events.get(id)) as EventRecord;
}

export async function deleteEvent(id: string): Promise<void> {
  await db.events.delete(id);
}

export async function listEvents(): Promise<EventRecord[]> {
  return db.events.toArray();
}

export async function getOccurrencesForRange(rangeStart: Date, rangeEnd: Date): Promise<EventOccurrence[]> {
  const events = await listEvents();
  return occurrencesInRange(events, rangeStart, rangeEnd);
}
