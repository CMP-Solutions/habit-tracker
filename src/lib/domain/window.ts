/**
 * Number of days the history/heatmap window reaches back from today.
 * The window is inclusive on both ends, so it covers
 * HISTORY_WINDOW_DAYS + 1 calendar days (the Heatmap renders exactly that many
 * cells).
 */
export const HISTORY_WINDOW_DAYS = 364;

/** Today at UTC midnight. */
export function utcToday(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** UTC midnight of the day `days` days before today. */
export function utcMidnightDaysAgo(days: number, now: Date = new Date()): Date {
  const d = utcToday(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Parses a "YYYY-MM-DD" string into UTC midnight, or null if invalid/absent. */
export function parseUtcDateString(value: unknown): Date | null {
  if (typeof value !== "string" || !DATE_ONLY_PATTERN.test(value)) return null;
  const date = new Date(value + "T00:00:00Z");
  return Number.isNaN(date.getTime()) ? null : date;
}
