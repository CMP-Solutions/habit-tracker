import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { densifyDailyResults } from "@/lib/domain/densify";
import { HISTORY_WINDOW_DAYS, utcMidnightDaysAgo, utcToday } from "@/lib/domain/window";
import { calculateCurrentStreak, calculateLongestStreak, calculateTotalSuccessCount } from "@/lib/domain/streak";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const { id } = await params;
  const goal = await db.goal.findUnique({ where: { id } });
  if (!goal || goal.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // The window matches the Heatmap grid exactly (HISTORY_WINDOW_DAYS days back
  // through today, inclusive), so no fetched entry is dropped and no cell is
  // rendered for a day that was never fetched.
  const since = utcMidnightDaysAgo(HISTORY_WINDOW_DAYS);
  const today = utcToday();

  const entries = await db.entry.findMany({
    where: { goalId: goal.id, date: { gte: since } },
    orderBy: { date: "asc" },
  });

  // Densify to real calendar days: a day without an entry is a failed day, so
  // that the rolling 7-day success rate is a true 7-calendar-day window.
  // Truncate createdAt to its UTC day first: a goal created today at 10:00
  // would otherwise compare as later than today's midnight and yield no days.
  const createdDay = utcToday(goal.createdAt);
  const from = createdDay > since ? createdDay : since;
  const results = from > today
    ? []
    : densifyDailyResults(
        entries.map((e) => ({
          date: e.date,
          success: goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity),
        })),
        from,
        today
      );

  const milestones = await db.milestone.findMany({ where: { goalId: goal.id }, orderBy: { achievedAt: "asc" } });

  // `results` truthfully shows an unchecked today as a gap (correct for the
  // heatmap/trend), but that would zero out a real streak before the user
  // has had a chance to check in today — drop today from the streak
  // calculation unless it already has a recorded entry.
  const hasTodayEntry = entries.some((e) => e.date.getTime() === today.getTime());
  const streakResults = hasTodayEntry ? results : results.slice(0, -1);

  return NextResponse.json({
    goal,
    results,
    milestones,
    // Surfaced so the UI can show the product's core promise (streaks) and
    // so the delete confirmation can know upfront whether this goal will
    // delete or archive, instead of finding out from a failed request.
    entryCount: entries.length,
    currentStreak: calculateCurrentStreak(streakResults),
    longestStreak: calculateLongestStreak(results),
    totalSuccessCount: calculateTotalSuccessCount(results),
  });
}
