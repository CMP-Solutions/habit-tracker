/** Monday-on-or-before `date`, at UTC midnight. Matches mondayOf() in weeklyGoal.ts. */
function startOfWeekUtc(date: Date): Date {
  const dayOfWeek = date.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const start = new Date(date);
  start.setUTCDate(start.getUTCDate() + diffToMonday);
  return start;
}

function daysFrom(start: Date, count: number): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    days.push(d);
  }
  return days;
}

/**
 * A fixed 6-week (42-day) grid covering the month `monthAnchor` falls in,
 * starting on the Monday on/before the 1st — the standard calendar-grid
 * layout, regardless of how many weeks the month itself spans.
 */
export function monthGridDays(monthAnchor: Date): Date[] {
  const firstOfMonth = new Date(Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth(), 1));
  return daysFrom(startOfWeekUtc(firstOfMonth), 42);
}

/** The 7 days (Monday-Sunday) of the week containing `dateInWeek`. */
export function weekDays(dateInWeek: Date): Date[] {
  return daysFrom(startOfWeekUtc(dateInWeek), 7);
}
