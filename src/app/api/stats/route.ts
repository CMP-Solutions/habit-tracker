import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { utcMidnightDaysAgo, utcToday } from "@/lib/domain/window";
import { periodBounds } from "@/lib/domain/periodCount";

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const { searchParams } = new URL(req.url);
  const requestedDays = Number(searchParams.get("days") ?? 30);
  const days = Number.isFinite(requestedDays) && requestedDays > 0 ? Math.floor(requestedDays) : 30;

  const today = utcToday();
  // Inclusive window of `days` calendar days ending today, anchored at UTC
  // midnight so the boundary day is never half-included. `days = 365` therefore
  // covers exactly the 365 cells the Heatmap renders.
  const since = utcMidnightDaysAgo(days - 1);
  // The current calendar week's summary always covers Monday through today
  // (not the full week — Friday/Saturday/Sunday haven't happened yet and
  // would only dilute the percentage), independent of the selected range.
  const weekStart = periodBounds(today, "week").start;
  const rangeStart = weekStart < since ? weekStart : since;

  const goals = await db.goal.findMany({ where: { userId, archived: false } });
  const entries = await db.entry.findMany({
    where: { goalId: { in: goals.map((g) => g.id) }, date: { gte: rangeStart } },
  });

  const entryByGoalAndDay = new Map(entries.map((e) => [`${e.goalId}_${utcDayKey(e.date)}`, e]));

  function countsForDay(day: Date) {
    const dayTime = day.getTime();
    let successCount = 0;
    let totalCount = 0;
    for (const goal of goals) {
      if (goal.endDate && utcToday(goal.endDate).getTime() < dayTime) continue;
      const entry = entryByGoalAndDay.get(`${goal.id}_${utcDayKey(day)}`);
      const createdDay = utcToday(goal.createdAt).getTime();
      // A goal normally doesn't count toward a day before it existed — but a
      // backfilled entry for that day (e.g. logged via the Woche grid) proves
      // it should, since backfilled history is never rejected.
      if (createdDay > dayTime && !entry) continue;
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

  const daily: { date: string; successCount: number; totalCount: number }[] = [];
  for (const cursor = new Date(rangeStart); cursor.getTime() <= today.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const { successCount, totalCount } = countsForDay(cursor);
    daily.push({ date: utcDayKey(cursor), successCount, totalCount });
  }

  const selectedRange = daily.filter((d) => new Date(d.date + "T00:00:00Z").getTime() >= since.getTime());
  const week = daily
    .filter((d) => new Date(d.date + "T00:00:00Z").getTime() >= weekStart.getTime())
    .reduce(
      (acc, d) => ({ successCount: acc.successCount + d.successCount, totalCount: acc.totalCount + d.totalCount }),
      { successCount: 0, totalCount: 0 }
    );

  return NextResponse.json({ daily: selectedRange, week });
}
