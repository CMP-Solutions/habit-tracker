import { DailyResult } from "./streak";
import { groupIntoCalendarPeriods, periodBounds, PeriodUnit } from "./periodCount";

export interface GoalPeriodicityConfig {
  periodicity: "daily" | "weekly" | "count_per_period";
  weeklyThreshold: number | null;
  periodUnit: "week" | "month" | null;
  periodTarget: number | null;
}

export interface StreakStats {
  currentStreak: number;
  longestStreak: number;
  totalSuccessCount: number;
}

function unitAndTarget(goal: GoalPeriodicityConfig): { unit: PeriodUnit; target: number } | null {
  if (goal.periodicity === "weekly" && goal.weeklyThreshold != null) {
    return { unit: "week", target: goal.weeklyThreshold };
  }
  if (
    goal.periodicity === "count_per_period" &&
    (goal.periodUnit === "week" || goal.periodUnit === "month") &&
    goal.periodTarget != null
  ) {
    return { unit: goal.periodUnit, target: goal.periodTarget };
  }
  return null;
}

/** Weekly and count_per_period goals succeed per week/month, not per day. */
export function isPeriodGoal(goal: GoalPeriodicityConfig): boolean {
  return unitAndTarget(goal) !== null;
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Streak numbers for a weekly/count_per_period goal, counted in DAYS so they
 * stay comparable with daily goals (and with the "7 / 30 / 100 Tage" medal
 * tiers): a "3x pro Woche" goal that hit its target four weeks in a row has
 * a streak of 12, not 4 and not 1.
 *
 * The streak is every successful day inside an unbroken chain of periods
 * that met their target. A completed period that missed its target breaks
 * the chain (its own successful days don't count toward the streak, though
 * they still count toward `totalSuccessCount`). The period containing
 * `today` is still open — it can't have failed yet, so it never breaks the
 * chain, and the successes it already has extend it right away.
 *
 * `dailyResults` must be gapless and reach through `today`, otherwise an
 * unfinished current period can't be told apart from a missed one. Returns
 * null for daily goals, which use the plain per-day streak functions.
 */
export function periodStreakStats(
  dailyResults: DailyResult[],
  goal: GoalPeriodicityConfig,
  today: Date
): StreakStats | null {
  const config = unitAndTarget(goal);
  if (!config) return null;

  const openPeriodStart = dateStr(periodBounds(today, config.unit).start);
  const periods = groupIntoCalendarPeriods(
    dailyResults.map((d) => ({ date: d.date, success: d.success })),
    config.unit
  );

  let run = 0;
  let longest = 0;
  let total = 0;
  for (const period of periods) {
    const successes = period.filter((d) => d.success).length;
    total += successes;
    const periodStart = dateStr(periodBounds(new Date(period[0].date + "T00:00:00Z"), config.unit).start);
    const isOpen = periodStart >= openPeriodStart;
    const failed = !isOpen && successes < config.target;
    run = failed ? 0 : run + successes;
    longest = Math.max(longest, run);
  }

  return { currentStreak: run, longestStreak: longest, totalSuccessCount: total };
}
