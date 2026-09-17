"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { TodoRow } from "@/components/TodoRow";
import { buttonVariants } from "@/components/ui/button";
import { listTodos, updateTodo, type TodoStatus } from "@/lib/storage/todos";
import type { TodoRecord } from "@/lib/storage/db";
import { utcToday } from "@/lib/domain/window";

export default function TodosPage() {
  const [tab, setTab] = useState<"open" | "done">("open");
  const [todos, setTodos] = useState<TodoRecord[]>([]);
  const todayStr = utcToday().toISOString().slice(0, 10);

  const load = useCallback((t: "open" | "done") => {
    listTodos({ done: t === "done" }).then(setTodos);
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  async function handleToggleDone(id: string, done: boolean) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    await updateTodo(id, { done });
  }

  async function handleStatusChange(id: string, status: TodoStatus) {
    const nowDone = status === "done";
    // A status change that moves the todo out of the tab currently shown
    // (done -> not-done on the "Erledigt" tab, or vice versa on "Offen")
    // removes it from view; otherwise it just updates in place.
    if (nowDone !== (tab === "done")) {
      setTodos((prev) => prev.filter((t) => t.id !== id));
    } else {
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, status, done: nowDone } : t)));
    }
    await updateTodo(id, { status });
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl">ToDos</h1>
        <Link href="/todos/new" className={buttonVariants({ size: "sm" })}>
          <Plus /> Neues ToDo
        </Link>
      </div>

      <div className="inline-flex rounded-lg border bg-muted/50 p-1">
        {(["open", "done"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "open" ? "Offen" : "Erledigt"}
          </button>
        ))}
      </div>

      {todos.length === 0 ? (
        <p className="text-muted-foreground">{tab === "open" ? "Keine offenen ToDos." : "Noch nichts erledigt."}</p>
      ) : (
        <div className="space-y-2">
          {todos.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              todayStr={todayStr}
              onToggleDone={handleToggleDone}
              onStatusChange={handleStatusChange}
              editable
            />
          ))}
        </div>
      )}
    </main>
  );
}
