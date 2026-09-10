import {
  DailyResult,
  calculateCurrentStreak,
  calculateTotalSuccessCount,
} from "./streak";

export interface MilestoneAward {
  type: "streak" | "total_count";
  threshold: number;
}

export const STREAK_THRESHOLDS = [7, 30, 100];
export const TOTAL_COUNT_THRESHOLDS = [100];

function alreadyHas(
  awarded: MilestoneAward[],
  type: MilestoneAward["type"],
  threshold: number
): boolean {
  return awarded.some((a) => a.type === type && a.threshold === threshold);
}

export function determineNewMilestones(
  results: DailyResult[],
  alreadyAwarded: MilestoneAward[]
): MilestoneAward[] {
  const newAwards: MilestoneAward[] = [];

  const currentStreak = calculateCurrentStreak(results);
  for (const threshold of STREAK_THRESHOLDS) {
    if (currentStreak >= threshold && !alreadyHas(alreadyAwarded, "streak", threshold)) {
      newAwards.push({ type: "streak", threshold });
    }
  }

  const totalCount = calculateTotalSuccessCount(results);
  for (const threshold of TOTAL_COUNT_THRESHOLDS) {
    if (totalCount >= threshold && !alreadyHas(alreadyAwarded, "total_count", threshold)) {
      newAwards.push({ type: "total_count", threshold });
    }
  }

  return newAwards;
}
