"use client";

import { useEffect, useState } from "react";
import { Heatmap } from "@/components/Heatmap";
import { TrendChart } from "@/components/TrendChart";

interface DayStat {
  date: string;
  successCount: number;
  totalCount: number;
}

const RANGES = [7, 30, 90, 365];

export default function StatsPage() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<DayStat[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/stats?days=${days}`).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Auswertung konnte nicht geladen werden.");
        return;
      }
      setError(null);
      setStats(await res.json());
    });
  }, [days]);

  const results = stats.map((s) => ({ date: s.date, success: s.totalCount > 0 && s.successCount === s.totalCount }));

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-6 py-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-3xl">Auswertung</h1>
        <div className="inline-flex rounded-lg border bg-muted/50 p-1">
          {RANGES.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1.5 font-mono text-sm transition-colors ${
                d === days ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {d}T
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Gesamt-Heatmap (alle Ziele)</h2>
        <Heatmap results={results} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Trend</h2>
        <TrendChart results={results} />
      </section>
    </main>
  );
}
