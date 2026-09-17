import type { EventRecord } from "@/lib/storage/db";

export interface EventOccurrence {
  eventId: string;
  title: string;
  /** "YYYY-MM-DD" of this concrete occurrence. */
  date: string;
  allDay: boolean;
  time: string | null;
}

const MS_PER_DAY = 86_400_000;

function parseUtcMidnight(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00Z");
}

function addUtcDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toOccurrence(event: EventRecord, date: string): EventOccurrence {
  return { eventId: event.id, title: event.title, date, allDay: event.allDay, time: event.time };
}

/**
 * Feb 29 has no equivalent in a non-leap year — rather than skip the
 * occurrence entirely, it falls back to Feb 28 of that year.
 */
function yearlyOccurrenceInYear(originalDate: Date, year: number): Date {
  const month = originalDate.getUTCMonth();
  const day = originalDate.getUTCDate();
  const isFeb29 = month === 1 && day === 29;
  if (isFeb29) {
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    if (!isLeapYear) return new Date(Date.UTC(year, 1, 28));
  }
  return new Date(Date.UTC(year, month, day));
}

function noneOccurrences(event: EventRecord, rangeStart: Date, rangeEnd: Date): EventOccurrence[] {
  const eventDate = parseUtcMidnight(event.date);
  if (eventDate >= rangeStart && eventDate < rangeEnd) {
    return [toOccurrence(event, event.date)];
  }
  return [];
}

function weeklyOccurrences(event: EventRecord, rangeStart: Date, rangeEnd: Date): EventOccurrence[] {
  const eventDate = parseUtcMidnight(event.date);
  if (eventDate >= rangeEnd) return [];

  let cursor = eventDate;
  if (cursor < rangeStart) {
    const diffDays = Math.floor((rangeStart.getTime() - cursor.getTime()) / MS_PER_DAY);
    const weeksToAdd = Math.ceil(diffDays / 7);
    cursor = addUtcDays(cursor, weeksToAdd * 7);
  }

  const result: EventOccurrence[] = [];
  while (cursor < rangeEnd) {
    if (cursor >= rangeStart) {
      result.push(toOccurrence(event, toDateString(cursor)));
    }
    cursor = addUtcDays(cursor, 7);
  }
  return result;
}

function yearlyOccurrences(event: EventRecord, rangeStart: Date, rangeEnd: Date): EventOccurrence[] {
  const eventDate = parseUtcMidnight(event.date);
  const result: EventOccurrence[] = [];
  for (let year = rangeStart.getUTCFullYear(); year <= rangeEnd.getUTCFullYear(); year++) {
    if (year < eventDate.getUTCFullYear()) continue;
    const occurrence = yearlyOccurrenceInYear(eventDate, year);
    if (occurrence >= rangeStart && occurrence < rangeEnd) {
      result.push(toOccurrence(event, toDateString(occurrence)));
    }
  }
  return result;
}

/**
 * Expands each event's recurrence rule into concrete dates within
 * [rangeStart, rangeEnd) — never stored, always computed on read, the same
 * convention as streaks and period evaluation elsewhere in the domain layer.
 */
export function occurrencesInRange(events: EventRecord[], rangeStart: Date, rangeEnd: Date): EventOccurrence[] {
  const result: EventOccurrence[] = [];
  for (const event of events) {
    if (event.recurrence === "none") result.push(...noneOccurrences(event, rangeStart, rangeEnd));
    else if (event.recurrence === "weekly") result.push(...weeklyOccurrences(event, rangeStart, rangeEnd));
    else result.push(...yearlyOccurrences(event, rangeStart, rangeEnd));
  }
  return result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
