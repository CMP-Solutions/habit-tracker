import { db } from "./db";
import { parseUtcDateString, utcToday } from "@/lib/domain/window";
import { densifyDailyResults } from "@/lib/domain/densify";
import { calculateCurrentStreak, calculateTotalSuccessCount } from "@/lib/domain/streak";
import { determineUpcomingProgress, MilestoneAward } from "@/lib/domain/milestones";

export interface AchievedMilestoneView {
  id: string;
  type: MilestoneAward["type"];
  threshold: number;
  achievedAt: string;
  goal: { title: string; icon: string | null };
}

export interface UpcomingMilestoneView {
  goalId: string;
  goalTitle: string;
  goalIcon: string | null;
  type: MilestoneAward["type"];
  threshold: number;
  current: number;
  /**
   * Thresholds of this type already earned for this goal (ascending) — a
   * broken-and-rebuilt streak never re-awards a tier already won, so the UI
   * can render those as permanently unlocked while only this `threshold`
   * (the next one) is still "in progress".
   */
  achievedThresholds: number[];
}

export async function getMilestones(): Promise<{
  achieved: AchievedMilestoneView[];
  upcoming: UpcomingMilestoneView[];
}> {
  const milestoneRecords = await db.milestones.toArray();
  milestoneRecords.sort((a, b) => (a.achievedAt < b.achievedAt ? 1 : a.achievedAt > b.achievedAt ? -1 : 0));

  const allGoals = await db.goals.toArray();
  const goalById = new Map(allGoals.map((g) => [g.id, g]));

  const achieved: AchievedMilestoneView[] = milestoneRecords
    .filter((m) => goalById.has(m.goalId))
    .map((m) => {
      const goal = goalById.get(m.goalId)!;
      return {
        id: m.id,
        type: m.type,
        threshold: m.threshold,
        achievedAt: m.achievedAt,
        goal: { title: goal.title, icon: goal.icon },
      };
    });

  const awardedByGoal = new Map<string, MilestoneAward[]>();
  for (const m of milestoneRecords) {
    const list = awardedByGoal.get(m.goalId) ?? [];
    list.push({ type: m.type, threshold: m.threshold });
    awardedByGoal.set(m.goalId, list);
  }

  // Upcoming progress only for goals still being tracked — an archived goal
  // won't accrue further streak/count progress, so showing "how close" to a
  // habit that's no longer active would be misleading.
  const activeGoals = allGoals.filter((g) => !g.archived);
  const today = utcToday();
  const upcoming: UpcomingMilestoneView[] = [];

  for (const goal of activeGoals) {
    const entries = await db.entries.where("goalId").equals(goal.id).sortBy("date");
    if (entries.length === 0) continue;

    const recorded = entries.map((e) => ({
      date: parseUtcDateString(e.date) as Date,
      success: goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity),
      skipped: e.skipped ?? false,
    }));
    const createdDay = parseUtcDateString(goal.createdAt) as Date;
    const earliestEntryDate = recorded[0].date;
    const from = earliestEntryDate < createdDay ? earliestEntryDate : createdDay;
    const results = densifyDailyResults(recorded, from, today);

    // Same "don't zero out a real streak for an undecided today" rule used
    // everywhere else streak is computed.
    const todayStr = today.toISOString().slice(0, 10);
    const hasTodayEntry = entries.some((e) => e.date === todayStr);
    const streakResults = hasTodayEntry ? results : results.slice(0, -1);

    const currentStreak = calculateCurrentStreak(streakResults);
    const totalCount = calculateTotalSuccessCount(results);
    const awarded = awardedByGoal.get(goal.id) ?? [];

    for (const progress of determineUpcomingProgress(currentStreak, totalCount, awarded)) {
      const achievedThresholds = awarded
        .filter((a) => a.type === progress.type)
        .map((a) => a.threshold)
        .sort((a, b) => a - b);
      upcoming.push({
        goalId: goal.id,
        goalTitle: goal.title,
        goalIcon: goal.icon,
        achievedThresholds,
        ...progress,
      });
    }
  }

  // Closest to completion first, so the list reads as "what's coming up
  // next" rather than an arbitrary per-goal grouping.
  upcoming.sort((a, b) => b.current / b.threshold - a.current / a.threshold);

  return { achieved, upcoming };
}
