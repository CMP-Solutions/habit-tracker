"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { GoalCard } from "@/components/GoalCard";
import { buttonVariants } from "@/components/ui/button";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { GOAL_TEMPLATES } from "@/lib/domain/goalTemplates";

interface Goal {
  id: string;
  title: string;
  icon: string | null;
  type: "boolean" | "quantitative";
  unit: string | null;
  targetValue: number | null;
  step: number;
  category: { name: string; color: string } | null;
  todayEntry: { done: boolean; value: number | null } | null;
  periodProgress: { current: number; target: number } | null;
}

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("de-DE", { weekday: "long" });
const DATE_FORMAT = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long" });

function completionRatio(goal: Goal): number {
  if (goal.type === "boolean") return goal.todayEntry?.done ? 1 : 0;
  const target = goal.targetValue ?? 0;
  if (target <= 0) return 0;
  return Math.min((goal.todayEntry?.value ?? 0) / target, 1);
}

export default function DashboardPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const today = new Date();

  const load = useCallback(async () => {
    const res = await fetch("/api/goals");
    if (res.ok) setGoals(await res.json());
  }, []);

  useEffect(() => {
    fetch("/api/goals").then((res) => (res.ok ? res.json() : null)).then((data) => {
      if (data) setGoals(data);
    });
  }, []);

  async function addTemplate(template: (typeof GOAL_TEMPLATES)[number]) {
    await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(template),
    });
    load();
  }

  const percentDone =
    goals.length > 0
      ? Math.round((goals.reduce((sum, g) => sum + completionRatio(g), 0) / goals.length) * 100)
      : 0;

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-10">
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

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Ziele</h2>
        <Link href="/goals/new" className={buttonVariants({ size: "sm" })}>
          <Plus /> Neues Ziel
        </Link>
      </div>

      {goals.length === 0 ? (
        <div className="space-y-4 rounded-xl border border-dashed p-6">
          <p className="text-center text-muted-foreground">
            Noch keine Ziele angelegt. Leg direkt los mit einer Vorlage:
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
    </main>
  );
}
