import { db, type EntryRecord, type MilestoneRecord } from "./db";
import { generateId } from "./id";
import { parseUtcDateString, utcToday } from "@/lib/domain/window";
import { DailyResult } from "@/lib/domain/streak";
import { densifyDailyResults } from "@/lib/domain/densify";
import { groupIntoWeeks, evaluateWeek } from "@/lib/domain/weeklyGoal";
import { groupIntoCalendarPeriods, evaluatePeriod, PeriodUnit } from "@/lib/domain/periodCount";
import { determineNewMilestones, MilestoneAward } from "@/lib/domain/milestones";

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
  };
  await db.entries.put(entry);

  const allEntries = await db.entries.where("goalId").equals(input.goalId).sortBy("date");
  const recorded = allEntries.map((e) => ({
    date: parseUtcDateString(e.date) as Date,
    success: goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity),
  }));

  // Streaks are calendar based: every day between the first recorded day and
  // the most recently recorded one must be present, so that days without an
  // entry break the streak instead of silently disappearing.
  const goalCreatedAt = parseUtcDateString(goal.createdAt) as Date;
  const firstRecorded = recorded[0]?.date ?? dayDate;
  const from = goalCreatedAt < firstRecorded ? goalCreatedAt : firstRecorded;
  const lastRecorded = recorded[recorded.length - 1]?.date ?? dayDate;
  const dailyResults: DailyResult[] = densifyDailyResults(recorded, from, lastRecorded);

  let evaluationResults: DailyResult[] = dailyResults;
  if (goal.periodicity === "weekly" && goal.weeklyThreshold != null) {
    const weeks = groupIntoWeeks(dailyResults.map((d) => ({ date: d.date, success: d.success })));
    evaluationResults = weeks.map((week) => ({
      date: week[0].date,
      success: evaluateWeek(week, goal.weeklyThreshold as number),
    }));
  } else if (
    goal.periodicity === "count_per_period" &&
    (goal.periodUnit === "week" || goal.periodUnit === "month") &&
    goal.periodTarget != null
  ) {
    const periods = groupIntoCalendarPeriods(
      dailyResults.map((d) => ({ date: d.date, success: d.success })),
      goal.periodUnit as PeriodUnit
    );
    evaluationResults = periods.map((period) => ({
      date: period[0].date,
      success: evaluatePeriod(period, goal.periodTarget as number),
    }));
  }

  const existingMilestones = await db.milestones.where("goalId").equals(input.goalId).toArray();
  const alreadyAwarded: MilestoneAward[] = existingMilestones.map((m) => ({ type: m.type, threshold: m.threshold }));

  const newMilestones = determineNewMilestones(evaluationResults, alreadyAwarded);
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
