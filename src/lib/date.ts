/**
 * Formats a Date as "YYYY-MM-DD" using the LOCAL calendar date parts.
 *
 * Entries are keyed by the calendar day the user experienced, so anything that
 * derives a day key from "now" in the browser must use the local date, never
 * `toISOString()` (which is UTC and is off by a day for part of every day for
 * users behind or ahead of UTC).
 */
export function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Today's calendar date in the local timezone, as "YYYY-MM-DD". */
export function todayLocalDate(): string {
  return formatLocalDate(new Date());
}
