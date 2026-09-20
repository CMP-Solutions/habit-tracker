import {
  DailyResult,
  calculateCurrentStreak,
  calculateTotalSuccessCount,
} from "./streak";

export interface MilestoneAward {
  type: "streak" | "total_count";
  threshold: number;
}

export const STREAK_THRESHOLDS = [3, 7, 30, 100, 365];
export const TOTAL_COUNT_THRESHOLDS = [100];

function alreadyHas(
  awarded: MilestoneAward[],
  type: MilestoneAward["type"],
  threshold: number
): boolean {
  return awarded.some((a) => a.type === type && a.threshold === threshold);
}

export interface UpcomingMilestoneProgress {
  type: MilestoneAward["type"];
  threshold: number;
  current: number;
}

/**
 * For each milestone type, finds the smallest threshold not yet awarded and
 * reports progress toward it — so the UI can show "23/30" ahead of time
 * instead of only revealing a milestone once it's already earned. A type
 * with every threshold already awarded contributes nothing (there is no
 * "next" one yet).
 */
export function determineUpcomingProgress(
  currentStreak: number,
  totalCount: number,
  alreadyAwarded: MilestoneAward[]
): UpcomingMilestoneProgress[] {
  const upcoming: UpcomingMilestoneProgress[] = [];

  const nextStreak = STREAK_THRESHOLDS.find((t) => !alreadyHas(alreadyAwarded, "streak", t));
  if (nextStreak !== undefined) {
    upcoming.push({ type: "streak", threshold: nextStreak, current: Math.min(currentStreak, nextStreak) });
  }

  const nextTotal = TOTAL_COUNT_THRESHOLDS.find((t) => !alreadyHas(alreadyAwarded, "total_count", t));
  if (nextTotal !== undefined) {
    upcoming.push({ type: "total_count", threshold: nextTotal, current: Math.min(totalCount, nextTotal) });
  }

  return upcoming;
}

/**
 * Awards for already-computed counts — lets goals whose streak isn't a plain
 * run of daily results (weekly / count_per_period goals) reuse the same
 * threshold logic.
 */
export function determineNewMilestonesFromCounts(
  currentStreak: number,
  totalCount: number,
  alreadyAwarded: MilestoneAward[]
): MilestoneAward[] {
  const newAwards: MilestoneAward[] = [];

  for (const threshold of STREAK_THRESHOLDS) {
    if (currentStreak >= threshold && !alreadyHas(alreadyAwarded, "streak", threshold)) {
      newAwards.push({ type: "streak", threshold });
    }
  }

  for (const threshold of TOTAL_COUNT_THRESHOLDS) {
    if (totalCount >= threshold && !alreadyHas(alreadyAwarded, "total_count", threshold)) {
      newAwards.push({ type: "total_count", threshold });
    }
  }

  return newAwards;
}

export function determineNewMilestones(
  results: DailyResult[],
  alreadyAwarded: MilestoneAward[]
): MilestoneAward[] {
  return determineNewMilestonesFromCounts(
    calculateCurrentStreak(results),
    calculateTotalSuccessCount(results),
    alreadyAwarded
  );
}
