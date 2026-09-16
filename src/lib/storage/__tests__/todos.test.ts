import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { createTodo, getTodo, updateTodo, deleteTodo } from "../todos";

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
