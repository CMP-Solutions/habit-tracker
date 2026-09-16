import { DailyResult } from "./streak";

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Expands a sparse list of recorded entries into a gapless array of calendar
 * days from `from` through `to` (both inclusive).
 *
 * Streak calculation requires one element per calendar day: a day without an
 * entry is a failed day, not an absent one. Feeding only the recorded rows into
 * `calculateCurrentStreak` would make "checked in once a week for seven weeks"
 * look like a seven day streak.
 *
 * Days are keyed by their UTC date, matching how entries are stored
 * (UTC midnight representing a calendar day).
 */
export function densifyDailyResults(
  entries: { date: Date; success: boolean; skipped?: boolean }[],
  from: Date,
  to: Date
): DailyResult[] {
  const byDate = new Map<string, { success: boolean; skipped: boolean }>();
  for (const entry of entries) {
    const key = utcDayKey(entry.date);
    const existing = byDate.get(key) ?? { success: false, skipped: false };
    // A day counts as a success if any entry for that day succeeded, and as
    // skipped if any entry for that day was skipped (in practice there's at
    // most one entry per goal+day, so this is really just "this day's entry").
    byDate.set(key, {
      success: existing.success || entry.success,
      skipped: existing.skipped || !!entry.skipped,
    });
  }

  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));

  const results: DailyResult[] = [];
  while (cursor.getTime() <= end.getTime()) {
    const key = utcDayKey(cursor);
    const day = byDate.get(key);
    results.push({ date: key, success: day?.success ?? false, skipped: day?.skipped ?? false });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return results;
}
