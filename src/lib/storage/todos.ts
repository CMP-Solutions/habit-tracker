import { db, type TodoRecord } from "./db";
import { generateId } from "./id";

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface CreateTodoInput {
  title: string;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: "low" | "normal" | "high" | null;
}

export async function createTodo(input: CreateTodoInput): Promise<TodoRecord> {
  if (!input.title || !input.title.trim()) {
    throw new Error("title is required.");
  }
  const todo: TodoRecord = {
    id: generateId(),
    title: input.title.trim(),
    dueDate: input.dueDate ?? null,
    dueTime: input.dueTime ?? null,
    priority: input.priority ?? null,
    done: false,
    createdAt: todayString(),
  };
  await db.todos.add(todo);
  return todo;
}

export async function getTodo(id: string): Promise<TodoRecord> {
  const todo = await db.todos.get(id);
  if (!todo) throw new Error("Not found");
  return todo;
}

export async function updateTodo(
  id: string,
  patch: Partial<CreateTodoInput> & { done?: boolean }
): Promise<TodoRecord> {
  const existing = await db.todos.get(id);
  if (!existing) throw new Error("Not found");
  if (patch.title !== undefined && !patch.title.trim()) {
    throw new Error("title is required.");
  }
  const changes: Partial<TodoRecord> = { ...patch };
  if (patch.title !== undefined) changes.title = patch.title.trim();
  await db.todos.update(id, changes);
  return (await db.todos.get(id)) as TodoRecord;
}

export async function deleteTodo(id: string): Promise<void> {
  await db.todos.delete(id);
}
