interface DayResult {
  date: string;
  success: boolean;
}

export function Heatmap({ results }: { results: DayResult[] }) {
  const byDate = new Map(results.map((r) => [r.date, r.success]));
  const days: { date: string; success: boolean | null }[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - 364);
  for (let i = 0; i < 365; i++) {
    const key = cursor.toISOString().slice(0, 10);
    days.push({ date: key, success: byDate.has(key) ? (byDate.get(key) as boolean) : null });
    cursor.setDate(cursor.getDate() + 1);
  }

  const weeks: (typeof days)[] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const colorFor = (success: boolean | null) =>
    success === null ? "bg-muted" : success ? "bg-emerald-500" : "bg-red-200";

  return (
    <div className="flex gap-1 overflow-x-auto pb-2">
      {weeks.map((week, i) => (
        <div key={i} className="flex flex-col gap-1">
          {week.map((day) => (
            <div key={day.date} title={day.date} className={`h-3 w-3 rounded-sm ${colorFor(day.success)}`} />
          ))}
        </div>
      ))}
    </div>
  );
}
