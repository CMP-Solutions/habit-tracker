import { db, type CategoryRecord, type GoalRecord, type EntryRecord, type MilestoneRecord } from "./db";

export interface ExportedData {
  version: 1;
  exportedAt: string;
  categories: CategoryRecord[];
  goals: GoalRecord[];
  entries: EntryRecord[];
  milestones: MilestoneRecord[];
}

export async function exportData(): Promise<ExportedData> {
  const [categories, goals, entries, milestones] = await Promise.all([
    db.categories.toArray(),
    db.goals.toArray(),
    db.entries.toArray(),
    db.milestones.toArray(),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    categories,
    goals,
    entries,
    milestones,
  };
}
