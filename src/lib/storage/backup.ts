import { db, type CategoryRecord, type GoalRecord, type EntryRecord, type MilestoneRecord, type TodoRecord, type EventRecord } from "./db";

export interface ExportedData {
  version: 1;
  exportedAt: string;
  categories: CategoryRecord[];
  goals: GoalRecord[];
  entries: EntryRecord[];
  milestones: MilestoneRecord[];
  todos?: TodoRecord[];
  events?: EventRecord[];
}

export async function exportData(): Promise<ExportedData> {
  const [categories, goals, entries, milestones, todos, events] = await Promise.all([
    db.categories.toArray(),
    db.goals.toArray(),
    db.entries.toArray(),
    db.milestones.toArray(),
    db.todos.toArray(),
    db.events.toArray(),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    categories,
    goals,
    entries,
    milestones,
    todos,
    events,
  };
}

function isCategoryRecord(v: unknown): v is CategoryRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.name === "string" && typeof r.color === "string" && typeof r.icon === "string";
}

function isGoalRecord(v: unknown): v is GoalRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.title === "string" &&
    (r.type === "boolean" || r.type === "quantitative") &&
    (r.periodicity === "daily" || r.periodicity === "weekly" || r.periodicity === "count_per_period") &&
    typeof r.archived === "boolean" &&
    typeof r.createdAt === "string"
  );
}

function isEntryRecord(v: unknown): v is EntryRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.goalId === "string" && typeof r.date === "string" && typeof r.done === "boolean";
}

function isMilestoneRecord(v: unknown): v is MilestoneRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.goalId === "string" &&
    (r.type === "streak" || r.type === "total_count") &&
    typeof r.threshold === "number" &&
    typeof r.achievedAt === "string"
  );
}

function isTodoRecord(v: unknown): v is TodoRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.title === "string" &&
    (typeof r.dueDate === "string" || r.dueDate === null) &&
    (typeof r.dueTime === "string" || r.dueTime === null) &&
    (r.priority === "low" || r.priority === "normal" || r.priority === "high" || r.priority === null) &&
    typeof r.done === "boolean" &&
    // Optional: a backup made before the status field existed won't have
    // it at all, and that must still import cleanly — only validate the
    // shape when the field is actually present.
    (r.status === undefined ||
      r.status === "open" ||
      r.status === "in_progress" ||
      r.status === "deferred" ||
      r.status === "done") &&
    typeof r.createdAt === "string"
  );
}

function isEventRecord(v: unknown): v is EventRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.title === "string" &&
    typeof r.date === "string" &&
    typeof r.allDay === "boolean" &&
    (typeof r.time === "string" || r.time === null) &&
    (r.recurrence === "none" || r.recurrence === "weekly" || r.recurrence === "yearly") &&
    typeof r.createdAt === "string"
  );
}

function isValidExport(v: unknown): v is ExportedData {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  if (r.version !== 1) return false;
  if (!Array.isArray(r.categories) || !r.categories.every(isCategoryRecord)) return false;
  if (!Array.isArray(r.goals) || !r.goals.every(isGoalRecord)) return false;
  if (!Array.isArray(r.entries) || !r.entries.every(isEntryRecord)) return false;
  if (!Array.isArray(r.milestones) || !r.milestones.every(isMilestoneRecord)) return false;
  if (r.todos !== undefined && (!Array.isArray(r.todos) || !r.todos.every(isTodoRecord))) return false;
  if (r.events !== undefined && (!Array.isArray(r.events) || !r.events.every(isEventRecord))) return false;
  return true;
}

export async function importData(data: unknown): Promise<void> {
  if (!isValidExport(data)) {
    throw new Error("Invalid export file.");
  }

  await db.transaction("rw", [db.categories, db.goals, db.entries, db.milestones, db.todos, db.events], async () => {
    await db.categories.clear();
    await db.goals.clear();
    await db.entries.clear();
    await db.milestones.clear();
    await db.todos.clear();
    await db.events.clear();
    await db.categories.bulkAdd(data.categories);
    await db.goals.bulkAdd(data.goals);
    await db.entries.bulkAdd(data.entries);
    await db.milestones.bulkAdd(data.milestones);
    await db.todos.bulkAdd(data.todos ?? []);
    await db.events.bulkAdd(data.events ?? []);
  });
}
