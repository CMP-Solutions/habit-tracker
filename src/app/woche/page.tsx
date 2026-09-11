"use client";

import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";

interface WeekEntry {
  done: boolean;
  value: number | null;
}

interface WeekGoal {
  id: string;
  title: string;
  icon: string | null;
  type: "boolean" | "quantitative";
  unit: string | null;
  targetValue: number | null;
  step: number;
  category: { name: string; color: string } | null;
  entries: Record<string, WeekEntry | null>;
}

interface WeekResponse {
  days: string[];
  goals: WeekGoal[];
}

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" });
const DAY_FORMAT = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

function isComplete(goal: WeekGoal, entry: WeekEntry | null): boolean {
  if (!entry) return false;
  if (goal.type === "boolean") return entry.done;
  return (entry.value ?? 0) >= (goal.targetValue ?? Infinity);
}

export default function WeekPage() {
  const [data, setData] = useState<WeekResponse | null>(null);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    const res = await fetch("/api/week");
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    fetch("/api/week").then((res) => (res.ok ? res.json() : null)).then((json) => {
      if (json) setData(json);
    });
  }, []);

  async function saveEntry(goalId: string, date: string, done: boolean, value?: number) {
    await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goalId, date, done, value }),
    });
    load();
  }

  if (!data) return <main className="px-6 py-10 text-muted-foreground">Lädt…</main>;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-6 py-10">
      <h1 className="font-heading text-3xl">Diese Woche</h1>

      {data.goals.length === 0 ? (
        <p className="text-muted-foreground">Noch keine Ziele angelegt.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card p-4 backdrop-blur-xl">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <th className="px-2 pb-3 text-left text-sm font-medium text-muted-foreground">Ziel</th>
                {data.days.map((day) => (
                  <th
                    key={day}
                    className={`px-2 pb-3 text-center text-xs font-normal ${
                      day === today ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <div>{WEEKDAY_FORMAT.format(new Date(day + "T00:00:00Z"))}</div>
                    <div className="font-mono">{DAY_FORMAT.format(new Date(day + "T00:00:00Z"))}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.goals.map((goal) => (
                <tr key={goal.id} className="border-t border-border/60">
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {goal.icon && <span className="text-base leading-none">{goal.icon}</span>}
                      {goal.title}
                    </span>
                  </td>
                  {data.days.map((day) => (
                    <td key={day} className="p-1 text-center">
                      <WeekCell
                        key={`${goal.entries[day]?.done ?? ""}-${goal.entries[day]?.value ?? ""}`}
                        goal={goal}
                        date={day}
                        entry={goal.entries[day]}
                        isFuture={day > today}
                        isToday={day === today}
                        onSave={saveEntry}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function WeekCell({
  goal,
  date,
  entry,
  isFuture,
  isToday,
  onSave,
}: {
  goal: WeekGoal;
  date: string;
  entry: WeekEntry | null;
  isFuture: boolean;
  isToday: boolean;
  onSave: (goalId: string, date: string, done: boolean, value?: number) => void;
}) {
  // Remounted via `key` whenever entry changes (see caller), so the initial
  // state below always reflects the latest saved value without an effect.
  const [value, setValue] = useState(entry?.value != null ? String(entry.value) : "");
  const complete = isComplete(goal, entry);

  const ringClass = isToday ? "ring-1 ring-primary/40" : "";

  if (goal.type === "boolean") {
    return (
      <button
        type="button"
        disabled={isFuture}
        onClick={() => onSave(goal.id, date, !complete)}
        className={`mx-auto flex size-8 items-center justify-center rounded-full border transition-colors disabled:opacity-30 ${ringClass} ${
          complete ? "border-celebrate bg-celebrate text-celebrate-foreground" : "border-border bg-muted/40 hover:bg-muted"
        }`}
      >
        {complete && <Check className="size-4" />}
      </button>
    );
  }

  return (
    <input
      type="number"
      disabled={isFuture}
      min={0}
      step={goal.step}
      value={value}
      onChange={(e) => {
        // The min attribute only affects the spinner arrows, not
        // typed/pasted input, so negative values are clamped here too.
        const raw = e.target.value;
        setValue(Number(raw) < 0 ? "0" : raw);
      }}
      onBlur={() => {
        if (!value) return;
        const numeric = Number(value);
        onSave(goal.id, date, numeric >= (goal.targetValue ?? 0), numeric);
      }}
      className={`w-14 rounded-md border bg-transparent px-1 py-1 text-center font-mono text-sm outline-none disabled:opacity-30 ${ringClass} ${
        complete ? "border-celebrate text-celebrate" : "border-border"
      }`}
    />
  );
}
