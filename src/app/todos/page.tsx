"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Plus } from "lucide-react";
import { TodoRow } from "@/components/TodoRow";
import { buttonVariants } from "@/components/ui/button";
import { listTodos, updateTodo, type TodoStatus } from "@/lib/storage/todos";
import type { TodoRecord } from "@/lib/storage/db";
import { utcToday } from "@/lib/domain/window";

// How long a todo lingers, visibly updated, before it's removed from a tab
// it no longer belongs to — long enough to register as feedback rather
// than an instant, glitchy disappearance. The fade itself is a separate,
// equal-length beat handled by AnimatePresence's exit transition below.
const LEAVE_TAB_LINGER_MS = 400;

export default function TodosPage() {
  const [tab, setTab] = useState<"open" | "done">("open");
  const [todos, setTodos] = useState<TodoRecord[]>([]);
  const todayStr = utcToday().toISOString().slice(0, 10);
  const reducedMotion = useReducedMotion();
  // Pending "remove from this tab" timers per todo id, so toggling a todo
  // back before the linger elapses cancels the scheduled removal instead
  // of yanking it away regardless.
  const removalTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const load = useCallback((t: "open" | "done") => {
    listTodos({ done: t === "done" }).then(setTodos);
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  useEffect(() => {
    const timers = removalTimers.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  // Shared by the checkbox and the status selector — both ultimately just
  // decide whether the todo is now done. Whichever tab is open, a todo that
  // no longer belongs there stays visible (showing its new state) for a
  // beat, then fades out via AnimatePresence, instead of vanishing on click.
  function settleTodo(id: string, nowDone: boolean, patch: Partial<TodoRecord>) {
    const existingTimer = removalTimers.current.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      removalTimers.current.delete(id);
    }

    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

    if (nowDone !== (tab === "done")) {
      const timer = setTimeout(() => {
        removalTimers.current.delete(id);
        setTodos((prev) => prev.filter((t) => t.id !== id));
      }, LEAVE_TAB_LINGER_MS);
      removalTimers.current.set(id, timer);
    }
  }

  async function handleToggleDone(id: string, done: boolean) {
    settleTodo(id, done, { done, status: done ? "done" : "open" });
    await updateTodo(id, { done });
  }

  async function handleStatusChange(id: string, status: TodoStatus) {
    settleTodo(id, status === "done", { status, done: status === "done" });
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

      {/*
        The empty message shares this AnimatePresence with the list items,
        keyed alongside them, instead of a ternary that swaps AnimatePresence
        out of the tree the instant the array empties — that would unmount
        the last fading item (and its AnimatePresence) before the exit
        animation runs. See the dashboard's ToDo column for the same pattern.
      */}
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {todos.length === 0 && (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0.05 : 0.5 }}
              className="text-muted-foreground"
            >
              {tab === "open" ? "Keine offenen ToDos." : "Noch nichts erledigt."}
            </motion.p>
          )}
          {todos.map((todo) => (
            <motion.div key={todo.id} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0.05 : 0.5 }}>
              <TodoRow
                todo={todo}
                todayStr={todayStr}
                onToggleDone={handleToggleDone}
                onStatusChange={handleStatusChange}
                editable
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </main>
  );
}
