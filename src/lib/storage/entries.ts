import { db, type EntryRecord, type MilestoneRecord } from "./db";
import { generateId } from "./id";
import { parseUtcDateString, utcToday } from "@/lib/domain/window";
import { DailyResult } from "@/lib/domain/streak";
import { densifyDailyResults } from "@/lib/domain/densify";
import { determineNewMilestones, determineNewMilestonesFromCounts, MilestoneAward } from "@/lib/domain/milestones";
import { isPeriodGoal, periodStreakStats } from "@/lib/domain/goalStreak";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function recordEntry(input: {
  goalId: string;
  date: string;
  done?: boolean;
  value?: number | null;
}): Promise<{ entry: EntryRecord; newMilestones: MilestoneAward[] }> {
  if (typeof input.goalId !== "string" || input.goalId.length === 0) {
    throw new Error("goalId is required.");
  }
  if (typeof input.date !== "string" || !DATE_PATTERN.test(input.date)) {
    throw new Error("date must be a calendar date in YYYY-MM-DD format.");
  }
  const dayDate = parseUtcDateString(input.date);
  if (!dayDate) {
    throw new Error("date is not a valid calendar date.");
  }

  const goal = await db.goals.get(input.goalId);
  if (!goal) throw new Error("Not found");

  const existing = await db.entries.where("[goalId+date]").equals([input.goalId, input.date]).first();
  const entry: EntryRecord = {
    id: existing?.id ?? generateId(),
    goalId: input.goalId,
    date: input.date,
    done: !!input.done,
    value: input.value ?? null,
    // Recording a real check-in always supersedes a previous skip for this day.
    skipped: false,
    skipReason: null,
  };
  await db.entries.put(entry);

  const allEntries = await db.entries.where("goalId").equals(input.goalId).sortBy("date");
  const recorded = allEntries.map((e) => ({
    date: parseUtcDateString(e.date) as Date,
    success: goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity),
    skipped: e.skipped ?? false,
  }));

  // Streaks are calendar based: every day between the first recorded day and
  // the most recently recorded one must be present, so that days without an
  // entry break the streak instead of silently disappearing.
  const goalCreatedAt = parseUtcDateString(goal.createdAt) as Date;
  const firstRecorded = recorded[0]?.date ?? dayDate;
  const from = goalCreatedAt < firstRecorded ? goalCreatedAt : firstRecorded;
  const lastRecorded = recorded[recorded.length - 1]?.date ?? dayDate;
  // Weekly/count_per_period goals need the days up to today too, so the
  // still-open current week/month isn't mistaken for a missed one.
  const today = utcToday();
  const to = isPeriodGoal(goal) && today > lastRecorded ? today : lastRecorded;
  const dailyResults: DailyResult[] = densifyDailyResults(recorded, from, to);

  const existingMilestones = await db.milestones.where("goalId").equals(input.goalId).toArray();
  const alreadyAwarded: MilestoneAward[] = existingMilestones.map((m) => ({ type: m.type, threshold: m.threshold }));

  const periodStats = periodStreakStats(dailyResults, goal, today);
  const newMilestones = periodStats
    ? determineNewMilestonesFromCounts(periodStats.currentStreak, periodStats.totalSuccessCount, alreadyAwarded)
    : determineNewMilestones(dailyResults, alreadyAwarded);
  if (newMilestones.length > 0) {
    const todayStr = utcToday().toISOString().slice(0, 10);
    const records: MilestoneRecord[] = newMilestones.map((m) => ({
      id: generateId(),
      goalId: input.goalId,
      type: m.type,
      threshold: m.threshold,
      achievedAt: todayStr,
    }));
    await db.milestones.bulkAdd(records);
  }

  return { entry, newMilestones };
}

/**
 * Marks `date` as an intentional pause for `goalId`: protects the streak
 * (see `calculateCurrentStreak`'s `skipped` handling) without counting as a
 * success anywhere — never awards a milestone, never advances period
 * progress. Overwrites any existing entry for that day, same as
 * `recordEntry`.
 */
export async function recordSkip(input: {
  goalId: string;
  date: string;
  reason?: string;
}): Promise<{ entry: EntryRecord }> {
  if (typeof input.goalId !== "string" || input.goalId.length === 0) {
    throw new Error("goalId is required.");
  }
  if (typeof input.date !== "string" || !DATE_PATTERN.test(input.date)) {
    throw new Error("date must be a calendar date in YYYY-MM-DD format.");
  }
  if (!parseUtcDateString(input.date)) {
    throw new Error("date is not a valid calendar date.");
  }

  const goal = await db.goals.get(input.goalId);
  if (!goal) throw new Error("Not found");

  const existing = await db.entries.where("[goalId+date]").equals([input.goalId, input.date]).first();
  const reason = input.reason?.trim();
  const entry: EntryRecord = {
    id: existing?.id ?? generateId(),
    goalId: input.goalId,
    date: input.date,
    done: false,
    value: null,
    skipped: true,
    skipReason: reason ? reason : null,
  };
  await db.entries.put(entry);
  return { entry };
}

/** Removes the entry (real or skipped) for `goalId` on `date`, if any — used to undo an accidental skip. */
export async function deleteEntry(input: { goalId: string; date: string }): Promise<void> {
  const existing = await db.entries.where("[goalId+date]").equals([input.goalId, input.date]).first();
  if (existing) await db.entries.delete(existing.id);
}
