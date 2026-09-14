import { db } from "./db";
import { utcToday, utcMidnightDaysAgo, parseUtcDateString } from "@/lib/domain/window";
import { periodBounds } from "@/lib/domain/periodCount";

export interface DayStat {
  date: string;
  successCount: number;
  totalCount: number;
}

export async function getStats(
  days: number = 30
): Promise<{ daily: DayStat[]; week: { successCount: number; totalCount: number } }> {
  const requestedDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 30;

  const today = utcToday();
  const todayStr = today.toISOString().slice(0, 10);
  // Inclusive window of `days` calendar days ending today. `days = 365`
  // therefore covers exactly the 365 cells the Heatmap renders.
  const since = utcMidnightDaysAgo(requestedDays - 1);
  const sinceStr = since.toISOString().slice(0, 10);

  // The current calendar week's summary always covers Monday through today
  // (not the full week — later days haven't happened yet and would only
  // dilute the percentage), independent of the selected range.
  const weekStartStr = periodBounds(today, "week").start.toISOString().slice(0, 10);
  const rangeStartStr = weekStartStr < sinceStr ? weekStartStr : sinceStr;

  const allGoals = await db.goals.toArray();
  const goals = allGoals.filter((g) => !g.archived);
  const goalIds = goals.map((g) => g.id);
  const entries =
    goalIds.length === 0
      ? []
      : await db.entries.where("goalId").anyOf(goalIds).and((e) => e.date >= rangeStartStr).toArray();

  const entryByGoalAndDay = new Map(entries.map((e) => [`${e.goalId}_${e.date}`, e]));

  function countsForDay(dateStr: string): { successCount: number; totalCount: number } {
    let successCount = 0;
    let totalCount = 0;
    for (const goal of goals) {
      if (goal.endDate && goal.endDate < dateStr) continue;
      const entry = entryByGoalAndDay.get(`${goal.id}_${dateStr}`);
      // A goal normally doesn't count toward a day before it existed — but a
      // backfilled entry for that day (e.g. logged via the Woche grid) proves
      // it should, since backfilled history is never rejected.
      if (goal.createdAt > dateStr && !entry) continue;
      totalCount++;
      const success = entry
        ? goal.type === "boolean"
          ? entry.done
          : (entry.value ?? 0) >= (goal.targetValue ?? Infinity)
        : false;
      if (success) successCount++;
    }
    return { successCount, totalCount };
  }

  const daily: DayStat[] = [];
  const cursor = parseUtcDateString(rangeStartStr) as Date;
  const end = parseUtcDateString(todayStr) as Date;
  while (cursor.getTime() <= end.getTime()) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const { successCount, totalCount } = countsForDay(dateStr);
    daily.push({ date: dateStr, successCount, totalCount });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const selectedRange = daily.filter((d) => d.date >= sinceStr);
  const week = daily
    .filter((d) => d.date >= weekStartStr)
    .reduce(
      (acc, d) => ({ successCount: acc.successCount + d.successCount, totalCount: acc.totalCount + d.totalCount }),
      { successCount: 0, totalCount: 0 }
    );

  return { daily: selectedRange, week };
}
