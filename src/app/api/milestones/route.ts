import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { utcToday } from "@/lib/domain/window";
import { densifyDailyResults } from "@/lib/domain/densify";
import { calculateCurrentStreak, calculateTotalSuccessCount } from "@/lib/domain/streak";
import { determineUpcomingProgress, MilestoneAward } from "@/lib/domain/milestones";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const achieved = await db.milestone.findMany({
    where: { goal: { userId } },
    include: { goal: { select: { title: true, icon: true } } },
    orderBy: { achievedAt: "desc" },
  });

  const awardedByGoal = new Map<string, MilestoneAward[]>();
  for (const m of achieved) {
    const list = awardedByGoal.get(m.goalId) ?? [];
    list.push({ type: m.type as MilestoneAward["type"], threshold: m.threshold });
    awardedByGoal.set(m.goalId, list);
  }

  // Upcoming progress only for goals still being tracked — an archived goal
  // won't accrue further streak/count progress, so showing "how close" to a
  // habit that's no longer active would be misleading.
  const goals = await db.goal.findMany({ where: { userId, archived: false } });
  const today = utcToday();
  const upcoming: {
    goalId: string;
    goalTitle: string;
    goalIcon: string | null;
    type: MilestoneAward["type"];
    threshold: number;
    current: number;
  }[] = [];

  for (const goal of goals) {
    const entries = await db.entry.findMany({ where: { goalId: goal.id }, orderBy: { date: "asc" } });
    if (entries.length === 0) continue;

    const recorded = entries.map((e) => ({
      date: e.date,
      success: goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity),
    }));
    const createdDay = utcToday(goal.createdAt);
    const earliestEntryDate = entries[0].date;
    const from = earliestEntryDate < createdDay ? earliestEntryDate : createdDay;
    const results = densifyDailyResults(recorded, from, today);

    // Same "don't zero out a real streak for an undecided today" rule as the
    // dashboard and goal-detail streak — see those routes for the rationale.
    const hasTodayEntry = entries.some((e) => e.date.getTime() === today.getTime());
    const streakResults = hasTodayEntry ? results : results.slice(0, -1);

    const currentStreak = calculateCurrentStreak(streakResults);
    const totalCount = calculateTotalSuccessCount(results);
    const awarded = awardedByGoal.get(goal.id) ?? [];

    for (const progress of determineUpcomingProgress(currentStreak, totalCount, awarded)) {
      upcoming.push({ goalId: goal.id, goalTitle: goal.title, goalIcon: goal.icon, ...progress });
    }
  }

  // Closest to completion first, so the list reads as "what's coming up
  // next" rather than an arbitrary per-goal grouping.
  upcoming.sort((a, b) => b.current / b.threshold - a.current / a.threshold);

  return NextResponse.json({ achieved, upcoming });
}
