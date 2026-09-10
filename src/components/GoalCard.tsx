"use client";

import { useState } from "react";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CategoryBadge } from "@/components/CategoryBadge";

interface Goal {
  id: string;
  title: string;
  type: "boolean" | "quantitative";
  unit: string | null;
  targetValue: number | null;
  category: { name: string; color: string } | null;
}

function todayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function GoalCard({ goal, onChecked }: { goal: Goal; onChecked: () => void }) {
  const [done, setDone] = useState(false);
  const [value, setValue] = useState("");

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
        <div className="flex items-center gap-2">
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
