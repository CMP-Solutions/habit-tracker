"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { GoalCard } from "@/components/GoalCard";
import { TodoRow } from "@/components/TodoRow";
import { buttonVariants } from "@/components/ui/button";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { GOAL_TEMPLATES } from "@/lib/domain/goalTemplates";
import { listGoalsWithProgress, createGoal, type GoalWithProgress } from "@/lib/storage/goals";
import { getDashboardTodos, updateTodo } from "@/lib/storage/todos";
import type { TodoRecord } from "@/lib/storage/db";
import { utcToday } from "@/lib/domain/window";
import {
  countOpenGoals,
  maybeShowReminder,
  isRemindersEnabled,
  shouldNotifyForGoal,
  goalReminderMessage,
  goalReminderStorageKey,
} from "@/lib/reminders";
import { useUserName } from "@/components/OnboardingGate";
import { possessive } from "@/lib/user";

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("de-DE", { weekday: "long" });
const DATE_FORMAT = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long" });

function completionRatio(goal: GoalWithProgress): number {
  if (goal.type === "boolean") return goal.todayEntry?.done ? 1 : 0;
  const target = goal.targetValue ?? 0;
  if (target <= 0) return 0;
  return Math.min((goal.todayEntry?.value ?? 0) / target, 1);
}

function checkGoalReminders(goals: GoalWithProgress[]) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  for (const goal of goals) {
    if (!goal.reminderTime) continue;
    // A goal already skipped today was a deliberate decision not to do it —
    // nagging about it anyway would undercut the point of being able to skip.
    const isOpen = goal.todayEntry?.skipped
      ? false
      : goal.type === "boolean"
        ? !(goal.todayEntry?.done ?? false)
        : (goal.todayEntry?.value ?? 0) < (goal.targetValue ?? Infinity);
    const key = goalReminderStorageKey(goal.id);
    const fire = shouldNotifyForGoal({
      reminderTime: goal.reminderTime,
      isOpen,
      enabled: isRemindersEnabled(),
      permissionGranted: true,
      now,
      lastNotifiedKey: localStorage.getItem(key),
      todayKey,
    });
    if (!fire) continue;
    new Notification("Ritual", { body: goalReminderMessage(goal.title) });
    localStorage.setItem(key, todayKey);
  }
}

export default function DashboardPage() {
  const [goals, setGoals] = useState<GoalWithProgress[]>([]);
  const [todos, setTodos] = useState<TodoRecord[]>([]);
  const today = new Date();
  const todayStr = utcToday().toISOString().slice(0, 10);
  const userName = useUserName();

  const load = useCallback(async () => {
    const data = await listGoalsWithProgress();
    setGoals(data);
    maybeShowReminder(countOpenGoals(data));
  }, []);

  const loadTodos = useCallback(() => {
    getDashboardTodos().then(setTodos);
  }, []);

  useEffect(() => {
    listGoalsWithProgress().then((data) => {
      setGoals(data);
      maybeShowReminder(countOpenGoals(data));
    });
    loadTodos();
  }, [loadTodos]);

  useEffect(() => {
    const interval = setInterval(() => {
      listGoalsWithProgress().then(checkGoalReminders);
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  async function addTemplate(template: (typeof GOAL_TEMPLATES)[number]) {
    await createGoal(template);
    load();
  }

  async function handleToggleTodoDone(id: string, done: boolean) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    await updateTodo(id, { done });
  }

  // A goal skipped for today was deliberately paused, not left incomplete —
  // it's excluded from the ratio entirely rather than counted as 0%.
  const activeGoals = goals.filter((g) => !g.todayEntry?.skipped);
  const percentDone =
    activeGoals.length > 0
      ? Math.round((activeGoals.reduce((sum, g) => sum + completionRatio(g), 0) / activeGoals.length) * 100)
      : 0;

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-10 flex items-end justify-between gap-6">
        <div>
          <p className="font-mono text-xs tracking-wide text-muted-foreground">
            {WEEKDAY_FORMAT.format(today)}
          </p>
          <h1 className="font-heading text-4xl">{DATE_FORMAT.format(today)}</h1>
        </div>
        {goals.length > 0 && (
          <div className="text-right">
            <p className="font-mono text-3xl tabular-nums text-primary">
              <NumberTicker value={percentDone} className="font-mono text-current" />%
            </p>
            <p className="text-xs text-muted-foreground">heute erledigt</p>
          </div>
        )}
      </header>

      <div className="grid gap-8 sm:grid-cols-2">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              {userName ? `${possessive(userName)} Ziele` : "Ziele"}
            </h2>
            <Link href="/goals/new" className={buttonVariants({ size: "sm" })}>
              <Plus /> Neues Ziel
            </Link>
          </div>

          {goals.length === 0 ? (
            <div className="space-y-4 rounded-xl border border-dashed p-6">
              <p className="text-center text-muted-foreground">
                Noch keine Ziele angelegt. Leg direkt los mit einer Vorlage:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {GOAL_TEMPLATES.map((template) => (
                  <button
                    key={template.title}
                    type="button"
                    onClick={() => addTemplate(template)}
                    className="flex flex-col items-center gap-1.5 rounded-lg border bg-muted/30 p-4 text-center transition-colors hover:bg-muted"
                  >
                    <span className="text-2xl leading-none">{template.icon}</span>
                    <span className="text-sm">{template.title}</span>
                  </button>
                ))}
              </div>
              <div className="text-center">
                <Link href="/goals/new" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Oder eigenes Ziel anlegen
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {goals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} onChecked={load} />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">ToDos</h2>
            <div className="flex items-center gap-3">
              <Link
                href="/todos"
                className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
              >
                Alle anzeigen
              </Link>
              <Link href="/todos/new" className={buttonVariants({ size: "sm" })}>
                <Plus /> Neues ToDo
              </Link>
            </div>
          </div>

          {todos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nichts Dringendes offen.</p>
          ) : (
            <div className="space-y-2">
              {todos.map((todo) => (
                <TodoRow key={todo.id} todo={todo} todayStr={todayStr} onToggleDone={handleToggleTodoDone} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
