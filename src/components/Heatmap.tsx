import { formatLocalDate } from "@/lib/date";
import { HISTORY_WINDOW_DAYS } from "@/lib/domain/window";

interface DayResult {
  date: string;
  success: boolean;
}

export function Heatmap({ results }: { results: DayResult[] }) {
  const byDate = new Map(results.map((r) => [r.date, r.success]));
  const days: { date: string; success: boolean | null }[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - HISTORY_WINDOW_DAYS);
  // HISTORY_WINDOW_DAYS days back through today, inclusive — the same window
  // the API routes fetch, so no entry is dropped and no cell is unfetched.
  for (let i = 0; i <= HISTORY_WINDOW_DAYS; i++) {
    // Local date parts, not toISOString(): entries are keyed by the user's
    // local calendar day (see formatLocalDate).
    const key = formatLocalDate(cursor);
    days.push({ date: key, success: byDate.has(key) ? (byDate.get(key) as boolean) : null });
    cursor.setDate(cursor.getDate() + 1);
  }

  const weeks: (typeof days)[] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  // Uses the app's own accent hue rather than a traffic-light red/green: a
  // day is either on-brand (done) or a quiet gap (missed), not an alarm.
  const colorFor = (success: boolean | null) =>
    success === null ? "bg-muted" : success ? "bg-primary" : "bg-destructive/20";

  return (
    <div className="flex gap-1 overflow-x-auto pb-2">
      {weeks.map((week, i) => (
        <div key={i} className="flex flex-col gap-1">
          {week.map((day) => (
            <div
              key={day.date}
              title={day.date}
              className={`h-3 w-3 rounded-[3px] transition-colors ${colorFor(day.success)}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
