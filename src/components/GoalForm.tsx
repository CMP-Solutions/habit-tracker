"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Category {
  id: string;
  name: string;
}

export function GoalForm() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"boolean" | "quantitative">("boolean");
  const [periodicity, setPeriodicity] = useState<"daily" | "weekly" | "count_per_period">("daily");
  const [periodUnit, setPeriodUnit] = useState<"week" | "month">("week");
  const [periodTarget, setPeriodTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [weeklyThreshold, setWeeklyThreshold] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>();
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
    const res = await fetch("/api/goals", {
      method: "POST",
      body: JSON.stringify({
        title,
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
      setError(body.error ?? "Fehler beim Anlegen.");
      return;
    }
    router.push("/");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Titel</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>

      <div className="space-y-2">
        <Label>Typ</Label>
        <Select value={type} onValueChange={(v) => handleTypeChange(v as "boolean" | "quantitative")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="boolean">Erledigt / nicht erledigt</SelectItem>
            <SelectItem value="quantitative">Messbare Menge</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {type === "quantitative" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="targetValue">Zielwert</Label>
            <Input id="targetValue" type="number" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="unit">Einheit</Label>
            <Input id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="z.B. Liter" required />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Periodizität</Label>
        <Select value={periodicity} onValueChange={(v) => setPeriodicity(v as "daily" | "weekly" | "count_per_period")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Täglich</SelectItem>
            <SelectItem value="weekly">Wöchentlich</SelectItem>
            {type === "boolean" && <SelectItem value="count_per_period">X-mal pro Zeitraum</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      {periodicity === "weekly" && (
        <div className="space-y-2">
          <Label htmlFor="weeklyThreshold">An wie vielen von 7 Tagen mindestens?</Label>
          <Input id="weeklyThreshold" type="number" min={1} max={7} value={weeklyThreshold} onChange={(e) => setWeeklyThreshold(e.target.value)} required />
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
            <Input id="periodTarget" type="number" min={1} value={periodTarget} onChange={(e) => setPeriodTarget(e.target.value)} required />
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

      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit">Ziel anlegen</Button>
    </form>
  );
}
