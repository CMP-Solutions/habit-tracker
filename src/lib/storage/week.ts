import { db } from "./db";
import { utcToday } from "@/lib/domain/window";
import { periodBounds } from "@/lib/domain/periodCount";

export interface WeekEntry {
  done: boolean;
  value: number | null;
  skipped: boolean;
  skipReason: string | null;
}

export interface WeekGoal {
  id: string;
  title: string;
  icon: string | null;
  type: "boolean" | "quantitative";
  unit: string | null;
  targetValue: number | null;
  step: number;
  category: { name: string; color: string } | null;
  entries: Record<string, WeekEntry | null>;
}

export interface WeekResult {
  days: string[];
  goals: WeekGoal[];
}

export async function getWeek(): Promise<WeekResult> {
  const today = utcToday();
  const todayStr = today.toISOString().slice(0, 10);
  const start = periodBounds(today, "week").start;

  const days: string[] = [];
  const cursor = new Date(start);
  for (let i = 0; i < 7; i++) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const allGoals = await db.goals.toArray();
  const goals = allGoals
    .filter((g) => {
      if (g.archived) return false;
      if (g.endDate && g.endDate < todayStr) return false;
      return true;
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

  const categories = await db.categories.toArray();
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const startStr = days[0];
  const endStr = days[6];
  const goalIds = goals.map((g) => g.id);
  const entries =
    goalIds.length === 0
      ? []
      : await db.entries
          .where("goalId")
          .anyOf(goalIds)
          .and((e) => e.date >= startStr && e.date <= endStr)
          .toArray();
  const entryByGoalAndDay = new Map(
    entries.map((e) => [
      `${e.goalId}_${e.date}`,
      { done: e.done, value: e.value, skipped: e.skipped ?? false, skipReason: e.skipReason ?? null },
    ])
  );

  return {
    days,
    goals: goals.map((goal) => {
      const category = goal.categoryId ? categoryById.get(goal.categoryId) : undefined;
      return {
        id: goal.id,
        title: goal.title,
        icon: goal.icon,
        type: goal.type,
        unit: goal.unit,
        targetValue: goal.targetValue,
        step: goal.step,
        category: category ? { name: category.name, color: category.color } : null,
        entries: Object.fromEntries(days.map((day) => [day, entryByGoalAndDay.get(`${goal.id}_${day}`) ?? null])),
      };
    }),
  };
}
