import { db, type GoalRecord } from "./db";
import { generateId } from "./id";
import { parseUtcDateString, utcToday, utcMidnightDaysAgo, HISTORY_WINDOW_DAYS } from "@/lib/domain/window";
import { periodBounds, PeriodUnit } from "@/lib/domain/periodCount";
import { densifyDailyResults } from "@/lib/domain/densify";
import { calculateCurrentStreak, calculateLongestStreak, calculateTotalSuccessCount } from "@/lib/domain/streak";
import { evaluationResultsForGoal, currentPeriodStart, currentPeriodAlreadySucceeded } from "@/lib/domain/goalStreak";

function utcTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface CreateGoalInput {
  title: string;
  description?: string;
  icon?: string | null;
  type: "boolean" | "quantitative";
  unit?: string;
  targetValue?: number;
  step?: number;
  periodicity: "daily" | "weekly" | "count_per_period";
  weeklyThreshold?: number;
  periodUnit?: "week" | "month";
  periodTarget?: number;
  categoryId?: string | null;
  endDate?: string | null;
  reminderTime?: string;
  motivation?: string;
}

export async function createGoal(input: CreateGoalInput): Promise<GoalRecord> {
  if (!input.title || !["boolean", "quantitative"].includes(input.type)) {
    throw new Error("title and a valid type are required.");
  }
  if (!["daily", "weekly", "count_per_period"].includes(input.periodicity)) {
    throw new Error("a valid periodicity is required.");
  }
  if (input.type === "quantitative" && (input.targetValue === undefined || input.targetValue === null)) {
    throw new Error("targetValue is required for quantitative goals.");
  }
  if (input.step !== undefined && !(input.step > 0)) {
    throw new Error("step must be a positive number.");
  }
  if (input.periodicity === "weekly" && (input.weeklyThreshold === undefined || input.weeklyThreshold === null)) {
    throw new Error("weeklyThreshold is required for weekly goals.");
  }
  if (input.periodicity === "count_per_period") {
    if (!["week", "month"].includes(input.periodUnit ?? "")) {
      throw new Error("periodUnit must be 'week' or 'month'.");
    }
    if (!Number.isInteger(input.periodTarget) || (input.periodTarget as number) < 1) {
      throw new Error("periodTarget must be a positive integer.");
    }
  }
  if (input.categoryId) {
    const category = await db.categories.get(input.categoryId);
    if (!category) throw new Error("Invalid category.");
  }

  const goal: GoalRecord = {
    id: generateId(),
    categoryId: input.categoryId ?? null,
    title: input.title,
    description: input.description ?? null,
    icon: input.icon ?? null,
    endDate: input.endDate ?? null,
    type: input.type,
    unit: input.type === "quantitative" ? (input.unit ?? null) : null,
    targetValue: input.type === "quantitative" ? (input.targetValue as number) : null,
    step: input.type === "quantitative" ? (input.step ?? 1) : 1,
    periodicity: input.periodicity,
    weeklyThreshold: input.periodicity === "weekly" ? (input.weeklyThreshold as number) : null,
    periodUnit: input.periodicity === "count_per_period" ? (input.periodUnit as "week" | "month") : null,
    periodTarget: input.periodicity === "count_per_period" ? (input.periodTarget as number) : null,
    archived: false,
    createdAt: utcTodayString(),
    reminderTime: input.reminderTime ?? null,
    motivation: input.motivation ?? null,
  };
  await db.goals.add(goal);
  return goal;
}

export async function listGoals(options?: { includeArchived?: boolean }): Promise<GoalRecord[]> {
  const all = await db.goals.orderBy("createdAt").toArray();
  return options?.includeArchived ? all : all.filter((g) => !g.archived);
}

export async function updateGoal(
  id: string,
  patch: Partial<CreateGoalInput> & { archived?: boolean }
): Promise<GoalRecord> {
  const existing = await db.goals.get(id);
  if (!existing) throw new Error("Not found");

  if (patch.step !== undefined && !(patch.step > 0)) {
    throw new Error("step must be a positive number.");
  }
  const effectivePeriodicity = patch.periodicity ?? existing.periodicity;
  if (effectivePeriodicity === "weekly") {
    const weeklyThreshold = patch.weeklyThreshold ?? existing.weeklyThreshold;
    if (weeklyThreshold === undefined || weeklyThreshold === null) {
      throw new Error("weeklyThreshold is required for weekly goals.");
    }
  }
  if (effectivePeriodicity === "count_per_period") {
    const periodUnit = patch.periodUnit ?? existing.periodUnit;
    const periodTarget = patch.periodTarget ?? existing.periodTarget;
    if (!["week", "month"].includes(periodUnit ?? "")) {
      throw new Error("periodUnit must be 'week' or 'month'.");
    }
    if (!Number.isInteger(periodTarget) || (periodTarget as number) < 1) {
      throw new Error("periodTarget must be a positive integer.");
    }
  }
  if (patch.categoryId) {
    const category = await db.categories.get(patch.categoryId);
    if (!category) throw new Error("Invalid category.");
  }

  const changes: Partial<GoalRecord> = { ...patch } as Partial<GoalRecord>;
  await db.goals.update(id, changes);
  return (await db.goals.get(id)) as GoalRecord;
}

export async function deleteGoal(id: string): Promise<void> {
  const entryCount = await db.entries.where("goalId").equals(id).count();
  if (entryCount > 0) {
    throw new Error("Goal has entries; archive it instead of deleting.");
  }
  await db.goals.delete(id);
}

export interface GoalWithProgress extends GoalRecord {
  category: { name: string; color: string } | null;
  todayEntry: { done: boolean; value: number | null; skipped: boolean; skipReason: string | null } | null;
  periodProgress: { current: number; target: number } | null;
  currentStreak: number;
}

export async function listGoalsWithProgress(): Promise<GoalWithProgress[]> {
  const today = utcToday();
  const todayStr = today.toISOString().slice(0, 10);

  // A goal past its end date drops off "Heute"/"Woche" but stays visible in
  // stats/milestones elsewhere — filtered here, not by mutating state.
  const allGoals = await db.goals.orderBy("createdAt").toArray();
  const goals = allGoals.filter((g) => {
    if (g.archived) return false;
    if (g.endDate && g.endDate < todayStr) return false;
    return true;
  });

  const goalIds = goals.map((g) => g.id);
  const todaysEntries = await db.entries.where("goalId").anyOf(goalIds).and((e) => e.date === todayStr).toArray();
  const entryByGoal = new Map(todaysEntries.map((e) => [e.goalId, e]));

  const categories = await db.categories.toArray();
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const periodProgressByGoal = new Map<string, { current: number; target: number }>();
  for (const goal of goals) {
    if (goal.periodicity !== "count_per_period" || !goal.periodUnit || goal.periodTarget == null) continue;
    const { start, end } = periodBounds(today, goal.periodUnit as PeriodUnit);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const entries = await db.entries
      .where("goalId")
      .equals(goal.id)
      .and((e) => e.date >= startStr && e.date <= endStr)
      .toArray();
    const current = entries.filter((e) =>
      goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity)
    ).length;
    periodProgressByGoal.set(goal.id, { current, target: goal.periodTarget });
  }

  // Current streak per goal, computed through the last fully-elapsed unit
  // (yesterday for daily goals, the last complete week/month for
  // weekly/count_per_period goals) then extended with a bonus for the
  // still-open current unit — an unfinished "today"/current period must not
  // zero out a real streak before the user has had a chance to complete it.
  const since = utcMidnightDaysAgo(60);
  const yesterday = utcMidnightDaysAgo(1);
  const sinceStr = since.toISOString().slice(0, 10);
  const streakByGoal = new Map<string, number>();

  function successOf(goal: GoalRecord, entry: { done: boolean; value: number | null }): boolean {
    return goal.type === "boolean" ? entry.done : (entry.value ?? 0) >= (goal.targetValue ?? Infinity);
  }

  for (const goal of goals) {
    // For weekly/count_per_period goals, the current period isn't closed
    // yet and is evaluated separately below (currentPeriodStart is null for
    // daily goals, so historyEnd falls back to the existing "yesterday").
    const currentStart = currentPeriodStart(today, goal);
    const historyEnd = currentStart ? utcMidnightDaysAgo(1, new Date(currentStart.getTime())) : yesterday;

    const entries = await db.entries
      .where("goalId")
      .equals(goal.id)
      .and((e) => e.date >= sinceStr && e.date <= historyEnd.toISOString().slice(0, 10))
      .sortBy("date");
    const createdDay = parseUtcDateString(goal.createdAt) as Date;
    let from = createdDay > since ? createdDay : since;
    // A backfilled entry dated before the goal's own createdAt must still
    // count toward the streak — goals never reject backfilled history.
    const earliestEntryDate = entries[0] ? (parseUtcDateString(entries[0].date) as Date) : undefined;
    if (earliestEntryDate && earliestEntryDate < from) from = earliestEntryDate;

    const dailyResults = from > historyEnd
      ? []
      : densifyDailyResults(
          entries.map((e) => ({
            date: parseUtcDateString(e.date) as Date,
            success: successOf(goal, e),
            skipped: e.skipped ?? false,
          })),
          from,
          historyEnd
        );
    let streak = calculateCurrentStreak(evaluationResultsForGoal(dailyResults, goal));

    if (currentStart) {
      // Weekly/count_per_period: has the still-open current period already
      // met its target from entries recorded so far this period?
      const currentStartStr = currentStart.toISOString().slice(0, 10);
      const currentEntries = await db.entries
        .where("goalId")
        .equals(goal.id)
        .and((e) => e.date >= currentStartStr && e.date <= todayStr)
        .sortBy("date");
      const currentDaily = densifyDailyResults(
        currentEntries.map((e) => ({
          date: parseUtcDateString(e.date) as Date,
          success: successOf(goal, e),
          skipped: e.skipped ?? false,
        })),
        currentStart,
        today
      );
      if (currentPeriodAlreadySucceeded(currentDaily, goal)) streak++;
    } else {
      // Daily: a skipped today is transparent, same as any other skipped
      // day — it neither breaks the streak computed through yesterday nor
      // extends it.
      const todayEntry = entryByGoal.get(goal.id);
      const todaySuccess = todayEntry ? successOf(goal, todayEntry) : false;
      if (!todayEntry?.skipped && todaySuccess) streak++;
    }
    streakByGoal.set(goal.id, streak);
  }

  return goals.map((goal) => {
    const entry = entryByGoal.get(goal.id);
    const category = goal.categoryId ? categoryById.get(goal.categoryId) : undefined;
    return {
      ...goal,
      category: category ? { name: category.name, color: category.color } : null,
      todayEntry: entry
        ? { done: entry.done, value: entry.value, skipped: entry.skipped ?? false, skipReason: entry.skipReason ?? null }
        : null,
      periodProgress: periodProgressByGoal.get(goal.id) ?? null,
      currentStreak: streakByGoal.get(goal.id) ?? 0,
    };
  });
}

export interface GoalHistory {
  goal: GoalRecord;
  results: { date: string; success: boolean; skipped?: boolean }[];
  milestones: { id: string; type: "streak" | "total_count"; threshold: number; achievedAt: string }[];
  entryCount: number;
  currentStreak: number;
  longestStreak: number;
  totalSuccessCount: number;
}

export async function getGoalHistory(id: string): Promise<GoalHistory> {
  const goal = await db.goals.get(id);
  if (!goal) throw new Error("Not found");

  // The window matches the Heatmap grid exactly (HISTORY_WINDOW_DAYS days
  // back through today, inclusive), so no fetched entry is dropped and no
  // cell is rendered for a day that was never fetched.
  const since = utcMidnightDaysAgo(HISTORY_WINDOW_DAYS);
  const today = utcToday();
  const sinceStr = since.toISOString().slice(0, 10);

  const entries = await db.entries.where("goalId").equals(id).and((e) => e.date >= sinceStr).sortBy("date");

  const createdDay = parseUtcDateString(goal.createdAt) as Date;
  let from = createdDay > since ? createdDay : since;
  // A backfilled entry dated before the goal's own createdAt must still
  // count — goals never reject backfilled history.
  const earliestEntryDate = entries[0] ? (parseUtcDateString(entries[0].date) as Date) : undefined;
  if (earliestEntryDate && earliestEntryDate < from) from = earliestEntryDate;

  const results = from > today
    ? []
    : densifyDailyResults(
        entries.map((e) => ({
          date: parseUtcDateString(e.date) as Date,
          success: goal.type === "boolean" ? e.done : (e.value ?? 0) >= (goal.targetValue ?? Infinity),
          skipped: e.skipped ?? false,
        })),
        from,
        today
      );

  const milestones = await db.milestones.where("goalId").equals(id).sortBy("achievedAt");

  // `results` truthfully shows an unchecked today/current period as a gap
  // (correct for the heatmap/trend), but that would zero out a real streak
  // before the user has had a chance to complete it — evaluate the streak
  // through the last fully-elapsed unit, then add a bonus if the still-open
  // current unit has already succeeded from entries recorded so far.
  const todayStr = today.toISOString().slice(0, 10);
  const currentStart = currentPeriodStart(today, goal);
  let currentStreak: number;
  if (currentStart) {
    const currentStartStr = currentStart.toISOString().slice(0, 10);
    const historyDaily = results.filter((r) => r.date < currentStartStr);
    const currentPeriodDaily = results.filter((r) => r.date >= currentStartStr);
    currentStreak = calculateCurrentStreak(evaluationResultsForGoal(historyDaily, goal));
    if (currentPeriodAlreadySucceeded(currentPeriodDaily, goal)) currentStreak++;
  } else {
    const hasTodayEntry = entries.some((e) => e.date === todayStr);
    const streakResults = hasTodayEntry ? results : results.slice(0, -1);
    currentStreak = calculateCurrentStreak(streakResults);
  }

  const evaluatedResults = evaluationResultsForGoal(results, goal);

  return {
    goal,
    results,
    milestones,
    entryCount: entries.length,
    currentStreak,
    longestStreak: calculateLongestStreak(evaluatedResults),
    totalSuccessCount: calculateTotalSuccessCount(evaluatedResults),
  };
}
