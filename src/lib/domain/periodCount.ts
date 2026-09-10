import { groupIntoWeeks, DayEntry } from "./weeklyGoal";

export type PeriodUnit = "week" | "month";

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

export function groupIntoCalendarPeriods(entries: DayEntry[], unit: PeriodUnit): DayEntry[][] {
  if (unit === "week") {
    return groupIntoWeeks(entries);
  }
  const periods = new Map<string, DayEntry[]>();
  for (const entry of entries) {
    const key = monthKey(entry.date);
    if (!periods.has(key)) periods.set(key, []);
    periods.get(key)!.push(entry);
  }
  return Array.from(periods.keys())
    .sort()
    .map((key) => periods.get(key)!);
}

export function evaluatePeriod(period: DayEntry[], target: number): boolean {
  return period.filter((d) => d.success).length >= target;
}

export function periodBounds(date: Date, unit: PeriodUnit): { start: Date; end: Date } {
  if (unit === "month") {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    return { start, end };
  }
  const dayOfWeek = date.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  start.setUTCDate(start.getUTCDate() + diffToMonday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start, end };
}
