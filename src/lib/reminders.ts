import type { GoalWithProgress } from "./storage/goals";

/** Local hour after which an evening reminder may fire. */
const REMINDER_HOUR = 18;

/** How many of today's goals are still open (unchecked, or below target). */
export function countOpenGoals(goals: GoalWithProgress[]): number {
  return goals.filter((goal) => {
    if (!goal.todayEntry) return true;
    // A goal already skipped today was a deliberate decision not to do it —
    // nagging about it anyway would undercut the point of being able to skip.
    if (goal.todayEntry.skipped) return false;
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

export function goalReminderStorageKey(goalId: string): string {
  return `ritual:goal-reminder-last:${goalId}`;
}

export function goalReminderMessage(goalTitle: string): string {
  return `Zeit für: ${goalTitle}`;
}

/**
 * Pure decision for a single goal's own reminder time, mirroring
 * `shouldNotify`'s shape but keyed by a specific "HH:mm" instead of the
 * fixed evening hour. `now` is a full Date (not just an hour) since a
 * specific time-of-day needs minute precision, unlike the generic evening
 * reminder.
 */
export function shouldNotifyForGoal(params: {
  reminderTime: string | null;
  isOpen: boolean;
  enabled: boolean;
  permissionGranted: boolean;
  now: Date;
  lastNotifiedKey: string | null;
  todayKey: string;
}): boolean {
  if (!params.enabled || !params.permissionGranted) return false;
  if (!params.reminderTime) return false;
  if (!params.isOpen) return false;
  if (params.lastNotifiedKey === params.todayKey) return false;

  const [hourStr, minuteStr] = params.reminderTime.split(":");
  const targetMinutes = Number(hourStr) * 60 + Number(minuteStr);
  const nowMinutes = params.now.getHours() * 60 + params.now.getMinutes();
  return nowMinutes >= targetMinutes;
}

const ENABLED_KEY = "ritual:reminders-enabled";
const LAST_NOTIFIED_KEY = "ritual:reminders-last-notified";

function todayKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function isRemindersEnabled(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(ENABLED_KEY) === "true";
}

export async function enableReminders(): Promise<void> {
  if (typeof Notification === "undefined") {
    throw new Error("Benachrichtigungen werden von diesem Browser nicht unterstützt.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Berechtigung für Benachrichtigungen wurde nicht erteilt.");
  }
  localStorage.setItem(ENABLED_KEY, "true");
}

export function disableReminders(): void {
  localStorage.removeItem(ENABLED_KEY);
}

/**
 * Called on app load/focus with the current open-goal count; shows a plain
 * browser Notification at most once per day, only in the evening, only if
 * enabled and permitted. No service worker or push subscription — this can
 * only fire while the tab is open, per the local-only reminders decision
 * (spec §2). Untested by design — see this plan's architecture note.
 */
export function maybeShowReminder(openCount: number): void {
  const now = new Date();
  const fire = shouldNotify({
    openCount,
    enabled: isRemindersEnabled(),
    permissionGranted: typeof Notification !== "undefined" && Notification.permission === "granted",
    hour: now.getHours(),
    todayKey: todayKey(now),
    lastNotifiedKey: localStorage.getItem(LAST_NOTIFIED_KEY),
  });
  if (!fire) return;

  new Notification("Ritual", { body: reminderMessage(openCount) });
  localStorage.setItem(LAST_NOTIFIED_KEY, todayKey(now));
}
