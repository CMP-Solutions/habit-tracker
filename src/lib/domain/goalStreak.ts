import { DailyResult } from "./streak";
import { groupIntoCalendarPeriods, evaluatePeriod, periodBounds, PeriodUnit } from "./periodCount";

export interface GoalPeriodicityConfig {
  periodicity: "daily" | "weekly" | "count_per_period";
  weeklyThreshold: number | null;
  periodUnit: "week" | "month" | null;
  periodTarget: number | null;
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

/**
 * Regroups daily results into one evaluated result per period (week/month)
 * for weekly/count_per_period goals — a "3x pro Woche" goal succeeds or
 * fails on a whole-period basis, not a daily one, so its streak must be a
 * streak of successful periods, not successful days. Daily goals pass
 * through unchanged. This is the same grouping `recordEntry` already uses
 * to decide milestone crossings; reusing it here keeps the displayed
 * streak/history numbers consistent with which milestones actually get
 * awarded, instead of the two disagreeing about what "streak" means.
 */
export function evaluationResultsForGoal(dailyResults: DailyResult[], goal: GoalPeriodicityConfig): DailyResult[] {
  const config = unitAndTarget(goal);
  if (!config) return dailyResults;
  const periods = groupIntoCalendarPeriods(
    dailyResults.map((d) => ({ date: d.date, success: d.success })),
    config.unit
  );
  return periods.map((period) => ({ date: period[0].date, success: evaluatePeriod(period, config.target) }));
}

/**
 * Start of the calendar period (week/month) that `today` falls in, for
 * weekly/count_per_period goals — the period still in progress, not yet
 * eligible for period-based evaluation via `evaluationResultsForGoal`.
 * Returns null for daily goals, which have no such concept.
 */
export function currentPeriodStart(today: Date, goal: GoalPeriodicityConfig): Date | null {
  const config = unitAndTarget(goal);
  if (!config) return null;
  return periodBounds(today, config.unit).start;
}

/**
 * Whether the still-in-progress current period has already met its target,
 * based on entries recorded so far this period (the period itself isn't
 * over yet). Used to extend a displayed streak by one when the current
 * period is already a success, without breaking the streak just because
 * the period hasn't finished — the same neutrality an unchecked "today"
 * already gets for daily goals (see `listGoalsWithProgress`).
 */
export function currentPeriodAlreadySucceeded(
  entriesSincePeriodStart: DailyResult[],
  goal: GoalPeriodicityConfig
): boolean {
  const config = unitAndTarget(goal);
  if (!config) return false;
  const successCount = entriesSincePeriodStart.filter((d) => d.success).length;
  return successCount >= config.target;
}
