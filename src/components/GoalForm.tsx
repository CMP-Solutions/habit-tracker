"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GOAL_ICONS, isGoalIcon, type GoalIcon } from "@/lib/domain/goalIcons";

interface Category {
  id: string;
  name: string;
}

export interface ExistingGoal {
  id: string;
  title: string;
  icon: string | null;
  type: "boolean" | "quantitative";
  unit: string | null;
  targetValue: number | null;
  periodicity: "daily" | "weekly" | "count_per_period";
  weeklyThreshold: number | null;
  periodUnit: "week" | "month" | null;
  periodTarget: number | null;
  categoryId: string | null;
}

function ToggleGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border bg-muted/50 p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
            value === opt.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function IconPicker({ value, onChange }: { value: GoalIcon | null; onChange: (icon: GoalIcon | null) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1.5">
      {GOAL_ICONS.map((icon) => (
        <button
          key={icon}
          type="button"
          onClick={() => onChange(value === icon ? null : icon)}
          aria-pressed={value === icon}
          className={`flex aspect-square items-center justify-center rounded-lg border text-lg transition-colors ${
            value === icon ? "border-primary bg-primary/15" : "border-transparent bg-muted/50 hover:bg-muted"
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

export function GoalForm({ existingGoal }: { existingGoal?: ExistingGoal }) {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState(existingGoal?.title ?? "");
  const [icon, setIcon] = useState<GoalIcon | null>(
    existingGoal?.icon && isGoalIcon(existingGoal.icon) ? existingGoal.icon : null
  );
  const [type, setType] = useState<"boolean" | "quantitative">(existingGoal?.type ?? "boolean");
  const [periodicity, setPeriodicity] = useState(existingGoal?.periodicity ?? "daily");
  const [periodUnit, setPeriodUnit] = useState<"week" | "month">(existingGoal?.periodUnit ?? "week");
  const [periodTarget, setPeriodTarget] = useState(existingGoal?.periodTarget?.toString() ?? "");
  const [unit, setUnit] = useState(existingGoal?.unit ?? "");
  const [targetValue, setTargetValue] = useState(existingGoal?.targetValue?.toString() ?? "");
  const [weeklyThreshold, setWeeklyThreshold] = useState(existingGoal?.weeklyThreshold?.toString() ?? "");
  const [categoryId, setCategoryId] = useState<string | undefined>(existingGoal?.categoryId ?? undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/categories").then((res) => res.json()).then(setCategories);
  }, []);

  function handleTypeChange(v: "boolean" | "quantitative") {
    setType(v);
    if (v === "quantitative" && periodicity === "count_per_period") {
      setPeriodicity("daily");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(existingGoal ? `/api/goals/${existingGoal.id}` : "/api/goals", {
      method: existingGoal ? "PATCH" : "POST",
      body: JSON.stringify({
        title,
        icon,
        type,
        periodicity,
        unit: type === "quantitative" ? unit : undefined,
        targetValue: type === "quantitative" ? Number(targetValue) : undefined,
        weeklyThreshold: periodicity === "weekly" ? Number(weeklyThreshold) : undefined,
        periodUnit: periodicity === "count_per_period" ? periodUnit : undefined,
        periodTarget: periodicity === "count_per_period" ? Number(periodTarget) : undefined,
        categoryId,
      }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Fehler beim Speichern.");
      return;
    }
    router.push(existingGoal ? `/goals/${existingGoal.id}` : "/");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border bg-card p-6 backdrop-blur-xl">
      <div className="space-y-2">
        <Label htmlFor="title">Titel</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="z.B. 3 Liter Wasser trinken"
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Icon (optional)</Label>
        <IconPicker value={icon} onChange={setIcon} />
      </div>

      <div className="space-y-2">
        <Label>Typ</Label>
        <ToggleGroup
          value={type}
          onChange={handleTypeChange}
          options={[
            { value: "boolean", label: "Abhaken (Ja/Nein)" },
            { value: "quantitative", label: "Menge eintragen" },
          ]}
        />
      </div>

      {type === "quantitative" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="targetValue">Zielmenge</Label>
            <Input id="targetValue" type="number" className="font-mono" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="unit">Einheit</Label>
            <Input id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="z.B. Liter" required />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Wie oft?</Label>
        <Select value={periodicity} onValueChange={(v) => setPeriodicity(v as "daily" | "weekly" | "count_per_period")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Täglich</SelectItem>
            <SelectItem value="weekly">Wöchentlich</SelectItem>
            {type === "boolean" && <SelectItem value="count_per_period">Mehrmals in einem Zeitraum</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      {periodicity === "weekly" && (
        <div className="space-y-2">
          <Label htmlFor="weeklyThreshold">Mindestens wie oft pro Woche?</Label>
          <Input id="weeklyThreshold" type="number" className="font-mono" min={1} max={7} value={weeklyThreshold} onChange={(e) => setWeeklyThreshold(e.target.value)} required />
        </div>
      )}

      {periodicity === "count_per_period" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Zeitraum</Label>
            <Select value={periodUnit} onValueChange={(v) => setPeriodUnit(v as "week" | "month")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Woche</SelectItem>
                <SelectItem value="month">Monat</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="periodTarget">Wie oft?</Label>
            <Input id="periodTarget" type="number" className="font-mono" min={1} value={periodTarget} onChange={(e) => setPeriodTarget(e.target.value)} required />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Kategorie</Label>
        <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? undefined)}>
          <SelectTrigger><SelectValue placeholder="Keine" /></SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full">{existingGoal ? "Speichern" : "Ziel anlegen"}</Button>
    </form>
  );
}
