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
}

export interface EntryRecord {
  id: string;
  goalId: string;
  /** "YYYY-MM-DD", UTC calendar day. */
  date: string;
  done: boolean;
  value: number | null;
}

export interface MilestoneRecord {
  id: string;
  goalId: string;
  type: "streak" | "total_count";
  threshold: number;
  /** "YYYY-MM-DD". */
  achievedAt: string;
}

type RitualDb = Dexie & {
  categories: EntityTable<CategoryRecord, "id">;
  goals: EntityTable<GoalRecord, "id">;
  entries: EntityTable<EntryRecord, "id">;
  milestones: EntityTable<MilestoneRecord, "id">;
};

export const db = new Dexie("ritual") as RitualDb;

db.version(1).stores({
  categories: "id, name",
  goals: "id, archived, categoryId, createdAt",
  entries: "id, goalId, date, [goalId+date]",
  milestones: "id, goalId, [goalId+type+threshold]",
});
