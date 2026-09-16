import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { createTodo, getTodo, updateTodo, deleteTodo, listTodos, getDashboardTodos } from "../todos";

describe("todos storage: CRUD", () => {
  beforeEach(async () => {
    await db.todos.clear();
  });

  it("creates a todo with only a title, defaulting everything else", async () => {
    const todo = await createTodo({ title: "Steuererklärung abschicken" });
    expect(todo.title).toBe("Steuererklärung abschicken");
    expect(todo.dueDate).toBeNull();
    expect(todo.dueTime).toBeNull();
    expect(todo.priority).toBeNull();
    expect(todo.done).toBe(false);
    expect(todo.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("creates a todo with all optional fields set", async () => {
    const todo = await createTodo({
      title: "Zahnarzttermin",
      dueDate: "2026-10-01",
      dueTime: "09:30",
      priority: "high",
    });
    expect(todo.dueDate).toBe("2026-10-01");
    expect(todo.dueTime).toBe("09:30");
    expect(todo.priority).toBe("high");
  });

  it("rejects an empty title", async () => {
    await expect(createTodo({ title: "" })).rejects.toThrow();
    await expect(createTodo({ title: "   " })).rejects.toThrow();
  });

  it("trims the title", async () => {
    const todo = await createTodo({ title: "  Wäsche waschen  " });
    expect(todo.title).toBe("Wäsche waschen");
  });

  it("gets a todo by id", async () => {
    const created = await createTodo({ title: "Post abholen" });
    const fetched = await getTodo(created.id);
    expect(fetched).toEqual(created);
  });

  it("throws when getting a nonexistent todo", async () => {
    await expect(getTodo("does-not-exist")).rejects.toThrow("Not found");
  });

  it("updates a todo's fields", async () => {
    const created = await createTodo({ title: "Post abholen" });
    const updated = await updateTodo(created.id, { title: "Post abholen (Paket)", priority: "normal" });
    expect(updated.title).toBe("Post abholen (Paket)");
    expect(updated.priority).toBe("normal");
  });

  it("marks a todo done via update", async () => {
    const created = await createTodo({ title: "Post abholen" });
    const updated = await updateTodo(created.id, { done: true });
    expect(updated.done).toBe(true);
  });

  it("rejects updating to an empty title", async () => {
    const created = await createTodo({ title: "Post abholen" });
    await expect(updateTodo(created.id, { title: "   " })).rejects.toThrow();
  });

  it("throws when updating a nonexistent todo", async () => {
    await expect(updateTodo("does-not-exist", { title: "x" })).rejects.toThrow("Not found");
  });

  it("deletes a todo", async () => {
    const created = await createTodo({ title: "Post abholen" });
    await deleteTodo(created.id);
    await expect(getTodo(created.id)).rejects.toThrow("Not found");
  });

  it("does not throw deleting a nonexistent todo", async () => {
    await expect(deleteTodo("does-not-exist")).resolves.toBeUndefined();
  });
});

describe("listTodos", () => {
  beforeEach(async () => {
    await db.todos.clear();
  });

  it("sorts by due date ascending, with no-date todos last", async () => {
    await createTodo({ title: "C - kein Datum" });
    await createTodo({ title: "A - früh", dueDate: "2026-10-01" });
    await createTodo({ title: "B - spät", dueDate: "2026-10-15" });

    const todos = await listTodos();
    expect(todos.map((t) => t.title)).toEqual(["A - früh", "B - spät", "C - kein Datum"]);
  });

  it("filters to only open todos when done is false", async () => {
    const a = await createTodo({ title: "Offen" });
    const b = await createTodo({ title: "Erledigt" });
    await updateTodo(b.id, { done: true });

    const open = await listTodos({ done: false });
    expect(open.map((t) => t.id)).toEqual([a.id]);
  });

  it("filters to only done todos when done is true", async () => {
    await createTodo({ title: "Offen" });
    const b = await createTodo({ title: "Erledigt" });
    await updateTodo(b.id, { done: true });

    const done = await listTodos({ done: true });
    expect(done.map((t) => t.id)).toEqual([b.id]);
  });

  it("returns every todo, done or not, when no filter is given", async () => {
    await createTodo({ title: "Offen" });
    const b = await createTodo({ title: "Erledigt" });
    await updateTodo(b.id, { done: true });

    const all = await listTodos();
    expect(all).toHaveLength(2);
  });
});

describe("getDashboardTodos", () => {
  const utcToday = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  };
  const daysAgo = (n: number) => {
    const d = utcToday();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };

  beforeEach(async () => {
    await db.todos.clear();
  });

  it("includes an overdue todo", async () => {
    await createTodo({ title: "Überfällig", dueDate: daysAgo(2) });
    const dashboard = await getDashboardTodos();
    expect(dashboard.map((t) => t.title)).toContain("Überfällig");
  });

  it("includes a todo due today", async () => {
    await createTodo({ title: "Heute", dueDate: daysAgo(0) });
    const dashboard = await getDashboardTodos();
    expect(dashboard.map((t) => t.title)).toContain("Heute");
  });

  it("includes a todo with no due date", async () => {
    await createTodo({ title: "Ohne Datum" });
    const dashboard = await getDashboardTodos();
    expect(dashboard.map((t) => t.title)).toContain("Ohne Datum");
  });

  it("excludes a todo due in the future", async () => {
    await createTodo({ title: "Zukunft", dueDate: daysAgo(-3) });
    const dashboard = await getDashboardTodos();
    expect(dashboard.map((t) => t.title)).not.toContain("Zukunft");
  });

  it("excludes an already-done todo even if overdue", async () => {
    const todo = await createTodo({ title: "Erledigt trotz überfällig", dueDate: daysAgo(2) });
    await updateTodo(todo.id, { done: true });
    const dashboard = await getDashboardTodos();
    expect(dashboard.map((t) => t.title)).not.toContain("Erledigt trotz überfällig");
  });
});
