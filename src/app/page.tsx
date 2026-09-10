"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { GoalCard } from "@/components/GoalCard";
import { buttonVariants } from "@/components/ui/button";

interface Goal {
  id: string;
  title: string;
  type: "boolean" | "quantitative";
  unit: string | null;
  targetValue: number | null;
  category: { name: string; color: string } | null;
  todayEntry: { done: boolean; value: number | null } | null;
  periodProgress: { current: number; target: number } | null;
}

export default function DashboardPage() {
  const [goals, setGoals] = useState<Goal[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/goals");
    if (res.ok) setGoals(await res.json());
  }, []);

  useEffect(() => {
    fetch("/api/goals").then((res) => (res.ok ? res.json() : null)).then((data) => {
      if (data) setGoals(data);
    });
  }, []);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Heute</h1>
        <Link href="/goals/new" className={buttonVariants()}>
          Neues Ziel
        </Link>
      </div>
      {goals.length === 0 && <p className="text-muted-foreground">Noch keine Ziele angelegt.</p>}
      <div className="space-y-3">
        {goals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} onChecked={load} />
        ))}
      </div>
    </main>
  );
}
