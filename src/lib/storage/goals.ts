import { db, type GoalRecord } from "./db";
import { generateId } from "./id";

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
  };
  await db.goals.add(goal);
  return goal;
}

export async function listGoals(options?: { includeArchived?: boolean }): Promise<GoalRecord[]> {
  const all = await db.goals.orderBy("createdAt").toArray();
  return options?.includeArchived ? all : all.filter((g) => !g.archived);
}
