export interface DayEntry {
  date: string; // "YYYY-MM-DD"
  success: boolean;
}

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const dayOfWeek = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

export function groupIntoWeeks(entries: DayEntry[]): DayEntry[][] {
  const weeks = new Map<string, DayEntry[]>();
  for (const entry of entries) {
    const key = mondayOf(entry.date);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key)!.push(entry);
  }
  return Array.from(weeks.keys())
    .sort()
    .map((key) => weeks.get(key)!);
}

export function evaluateWeek(week: DayEntry[], threshold: number): boolean {
  const successCount = week.filter((d) => d.success).length;
  return successCount >= threshold;
}
