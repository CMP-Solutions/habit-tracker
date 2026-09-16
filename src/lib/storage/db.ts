import Dexie, { type EntityTable } from "dexie";

export interface CategoryRecord {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export interface GoalRecord {
  id: string;
  categoryId: string | null;
  title: string;
  description: string | null;
  icon: string | null;
  /** "YYYY-MM-DD" or null for an ongoing goal. */
  endDate: string | null;
  type: "boolean" | "quantitative";
  unit: string | null;
  targetValue: number | null;
  step: number;
  periodicity: "daily" | "weekly" | "count_per_period";
  weeklyThreshold: number | null;
  periodUnit: "week" | "month" | null;
  periodTarget: number | null;
  archived: boolean;
  /** "YYYY-MM-DD" — the day the goal was created, UTC. */
  createdAt: string;
  /** "HH:mm" 24h local time for a per-goal reminder, or null for none. */
  reminderTime: string | null;
  /** Optional free text: why this goal matters, shown only on its detail page. */
  motivation: string | null;
}

export interface EntryRecord {
  id: string;
  goalId: string;
  /** "YYYY-MM-DD", UTC calendar day. */
  date: string;
  done: boolean;
  value: number | null;
  /** True when the user explicitly paused this goal for this day. */
  skipped: boolean;
  /** Optional free-text reason entered when skipping; null if none given. */
  skipReason: string | null;
}

export interface MilestoneRecord {
  id: string;
  goalId: string;
  type: "streak" | "total_count";
  threshold: number;
  /** "YYYY-MM-DD". */
  achievedAt: string;
}

export interface TodoRecord {
  id: string;
  title: string;
  /** "YYYY-MM-DD" or null for no due date. */
  dueDate: string | null;
  /** "HH:mm", only meaningful when dueDate is set. */
  dueTime: string | null;
  priority: "low" | "normal" | "high" | null;
  done: boolean;
  /** "YYYY-MM-DD" — the day the todo was created, UTC. */
  createdAt: string;
}

type RitualDb = Dexie & {
  categories: EntityTable<CategoryRecord, "id">;
  goals: EntityTable<GoalRecord, "id">;
  entries: EntityTable<EntryRecord, "id">;
  milestones: EntityTable<MilestoneRecord, "id">;
  todos: EntityTable<TodoRecord, "id">;
};

export const db = new Dexie("ritual") as RitualDb;

db.version(1).stores({
  categories: "id, name",
  goals: "id, archived, categoryId, createdAt",
  entries: "id, goalId, date, [goalId+date]",
  milestones: "id, goalId, [goalId+type+threshold]",
});

db.version(2).stores({
  categories: "id, name",
  goals: "id, archived, categoryId, createdAt",
  entries: "id, goalId, date, [goalId+date]",
  milestones: "id, goalId, [goalId+type+threshold]",
  todos: "id, done, dueDate",
});
