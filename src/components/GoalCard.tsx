"use client";

import { useState } from "react";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CategoryBadge } from "@/components/CategoryBadge";
import { ProgressRing } from "@/components/ProgressRing";
import { todayLocalDate } from "@/lib/date";

interface Goal {
  id: string;
  title: string;
  type: "boolean" | "quantitative";
  unit: string | null;
  targetValue: number | null;
  category: { name: string; color: string } | null;
  todayEntry?: { done: boolean; value: number | null } | null;
  periodProgress?: { current: number; target: number } | null;
}

export function GoalCard({ goal, onChecked }: { goal: Goal; onChecked: () => void }) {
  // Seed from today's persisted entry so a reload reflects an existing check-in.
  const [done, setDone] = useState(goal.todayEntry?.done ?? false);
  const [value, setValue] = useState(
    goal.todayEntry?.value != null ? String(goal.todayEntry.value) : ""
  );

  async function checkIn(newDone: boolean, newValue?: number) {
    const today = todayLocalDate();
    await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goalId: goal.id, date: today, done: newDone, value: newValue }),
    });
    onChecked();
  }

  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="space-y-1">
        <Link href={`/goals/${goal.id}`} className="font-medium hover:underline">
          {goal.title}
        </Link>
        {goal.category && <CategoryBadge name={goal.category.name} color={goal.category.color} />}
        {goal.periodProgress && (
          <p className="text-xs text-muted-foreground">
            {goal.periodProgress.current} von {goal.periodProgress.target} diese Periode
          </p>
        )}
      </div>
      {goal.type === "boolean" ? (
        <Checkbox
          checked={done}
          onCheckedChange={(checked) => {
            const next = checked === true;
            setDone(next);
            checkIn(next);
          }}
        />
      ) : (
        <div className="flex items-center gap-3">
          <ProgressRing value={Number(value) || 0} target={goal.targetValue ?? 0} unit={goal.unit} />
          <Input
            type="number"
            className="w-20"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => value && checkIn(Number(value) >= (goal.targetValue ?? 0), Number(value))}
          />
          <span className="text-sm text-muted-foreground">/ {goal.targetValue} {goal.unit}</span>
        </div>
      )}
    </div>
  );
}
