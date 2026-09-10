"use client";

import { useEffect, useState } from "react";
import { Heatmap } from "@/components/Heatmap";
import { TrendChart } from "@/components/TrendChart";

interface DayStat {
  date: string;
  successCount: number;
  totalCount: number;
}

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
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Auswertung</h1>
        <div className="flex gap-2">
          {[7, 30, 90, 365].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1 text-sm ${d === days ? "bg-primary text-primary-foreground" : "bg-muted"}`}
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
