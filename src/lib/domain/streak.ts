export interface DailyResult {
  date: string;
  success: boolean;
  /** A day the user explicitly paused: doesn't break the streak, doesn't extend it either. */
  skipped?: boolean;
}

export function calculateCurrentStreak(results: DailyResult[]): number {
  let streak = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].skipped) continue;
    if (!results[i].success) break;
    streak++;
  }
  return streak;
}

export function calculateLongestStreak(results: DailyResult[]): number {
  let longest = 0;
  let current = 0;
  for (const result of results) {
    if (result.skipped) continue;
    if (result.success) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

export function calculateTotalSuccessCount(results: DailyResult[]): number {
  return results.filter((r) => r.success).length;
}
