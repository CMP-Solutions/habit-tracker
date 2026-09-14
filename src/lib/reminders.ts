import type { GoalWithProgress } from "./storage/goals";

/** Local hour after which an evening reminder may fire. */
const REMINDER_HOUR = 18;

/** How many of today's goals are still open (unchecked, or below target). */
export function countOpenGoals(goals: GoalWithProgress[]): number {
  return goals.filter((goal) => {
    if (!goal.todayEntry) return true;
    return goal.type === "boolean"
      ? !goal.todayEntry.done
      : (goal.todayEntry.value ?? 0) < (goal.targetValue ?? Infinity);
  }).length;
}

export function reminderMessage(openCount: number): string {
  return openCount === 1 ? "Du hast heute noch 1 offenes Ziel." : `Du hast heute noch ${openCount} offene Ziele.`;
}

/**
 * Pure decision of whether an evening reminder should fire right now, given
 * already-gathered facts about permission, local time, and today's earlier
 * notification history. Kept free of browser globals so it's unit-testable;
 * the browser-API glue that gathers these facts and calls Notification()
 * lives in the rest of this file (Task 2), verified manually instead — see
 * this plan's architecture note.
 */
export function shouldNotify(params: {
  openCount: number;
  enabled: boolean;
  permissionGranted: boolean;
  hour: number;
  todayKey: string;
  lastNotifiedKey: string | null;
}): boolean {
  if (!params.enabled || !params.permissionGranted) return false;
  if (params.openCount <= 0) return false;
  if (params.hour < REMINDER_HOUR) return false;
  if (params.lastNotifiedKey === params.todayKey) return false;
  return true;
}
