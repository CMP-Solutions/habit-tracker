"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import { Check, Flame } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CategoryBadge } from "@/components/CategoryBadge";
import { ProgressRing } from "@/components/ProgressRing";
import { todayLocalDate } from "@/lib/date";

interface Goal {
  id: string;
  title: string;
  icon?: string | null;
  type: "boolean" | "quantitative";
  unit: string | null;
  targetValue: number | null;
  step: number;
  category: { name: string; color: string } | null;
  todayEntry?: { done: boolean; value: number | null } | null;
  periodProgress?: { current: number; target: number } | null;
  currentStreak: number;
}

// canvas-confetti paints on a raw 2D canvas and can't resolve CSS custom
// properties, so these mirror --primary/--celebrate as static hex values.
const CELEBRATE_COLORS = ["#2f6d7a", "#d9a441"];
const AUTO_SAVE_DELAY_MS = 500;

function celebrate(origin: { x: number; y: number }) {
  confetti({
    particleCount: 26,
    spread: 60,
    startVelocity: 30,
    gravity: 1.1,
    scalar: 0.8,
    colors: CELEBRATE_COLORS,
    origin,
  });
}

export function GoalCard({ goal, onChecked }: { goal: Goal; onChecked: () => void }) {
  // Seed from today's persisted entry so a reload reflects an existing check-in.
  const [done, setDone] = useState(goal.todayEntry?.done ?? false);
  const [value, setValue] = useState(
    goal.todayEntry?.value != null ? String(goal.todayEntry.value) : ""
  );
  const checkboxWrapRef = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(done);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    doneRef.current = done;
  });

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  function celebrateFrom(el: HTMLElement | null) {
    const rect = el?.getBoundingClientRect();
    if (!rect) return;
    celebrate({
      x: (rect.left + rect.width / 2) / window.innerWidth,
      y: (rect.top + rect.height / 2) / window.innerHeight,
    });
  }

  async function checkIn(newDone: boolean, newValue?: number) {
    const today = todayLocalDate();
    await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goalId: goal.id, date: today, done: newDone, value: newValue }),
    });
    onChecked();
  }

  // Shared by the debounced auto-save (while typing) and blur (leaving the
  // field): whichever fires first commits, the other is a no-op cancel.
  function commitValue(raw: string) {
    if (!raw) return;
    const numeric = Number(raw);
    const reachedTarget = numeric >= (goal.targetValue ?? 0);
    if (reachedTarget && !doneRef.current) celebrateFrom(inputWrapRef.current);
    setDone(reachedTarget);
    checkIn(reachedTarget, numeric);
  }

  function handleValueChange(rawInput: string) {
    // The number input's min attribute only affects the spinner arrows, not
    // typed/pasted input, so negative values are clamped here too.
    const raw = Number(rawInput) < 0 ? "0" : rawInput;
    setValue(raw);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => commitValue(raw), AUTO_SAVE_DELAY_MS);
  }

  function handleBlur() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    commitValue(value);
  }

  const accentColor = goal.category?.color ?? "var(--border)";

  return (
    <div
      className="flex items-center justify-between gap-4 rounded-lg border border-l-4 bg-card p-4 backdrop-blur-xl"
      style={{ borderLeftColor: accentColor }}
    >
      <div className="min-w-0 space-y-1">
        <Link href={`/goals/${goal.id}`} className="flex items-center gap-2 font-medium hover:underline">
          {goal.icon && <span className="text-lg leading-none">{goal.icon}</span>}
          {goal.title}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {goal.category && <CategoryBadge name={goal.category.name} color={goal.category.color} />}
          {goal.currentStreak > 0 && (
            <span className="flex items-center gap-1 font-mono text-xs text-primary">
              <Flame className="size-3" /> {goal.currentStreak}
            </span>
          )}
        </div>
        {goal.periodProgress && (
          <p className="font-mono text-xs text-muted-foreground">
            {goal.periodProgress.current} von {goal.periodProgress.target} diese Periode
          </p>
        )}
      </div>
      {goal.type === "boolean" ? (
        <div ref={checkboxWrapRef}>
          <Checkbox
            className="size-6 rounded-full [&_svg]:size-4 data-checked:[animation:goal-complete-pop_320ms_ease-out] data-checked:bg-celebrate data-checked:border-celebrate data-checked:text-celebrate-foreground data-checked:shadow-[0_0_10px_-1px_var(--color-celebrate)]"
            checked={done}
            onCheckedChange={(checked) => {
              const next = checked === true;
              setDone(next);
              checkIn(next);
              if (next) celebrateFrom(checkboxWrapRef.current);
            }}
          />
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {done ? (
            <div
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-celebrate text-celebrate-foreground [animation:goal-complete-pop_320ms_ease-out] shadow-[0_0_10px_-1px_var(--color-celebrate)]"
              title="Ziel erreicht"
            >
              <Check className="size-6" />
            </div>
          ) : (
            <ProgressRing value={Number(value) || 0} target={goal.targetValue ?? 0} unit={goal.unit} />
          )}
          <div ref={inputWrapRef}>
            <Input
              type="number"
              className="w-20 font-mono"
              min={0}
              step={goal.step}
              value={value}
              onChange={(e) => handleValueChange(e.target.value)}
              onBlur={handleBlur}
            />
          </div>
          <span className="font-mono text-sm text-muted-foreground">
            / {goal.targetValue} {goal.unit}
          </span>
        </div>
      )}
    </div>
  );
}
