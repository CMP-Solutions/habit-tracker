"use client";

import { useEffect, useState } from "react";
import { Heatmap } from "@/components/Heatmap";
import { TrendChart } from "@/components/TrendChart";

interface DayStat {
  date: string;
  successCount: number;
  totalCount: number;
}

interface StatsResponse {
  daily: DayStat[];
  week: { successCount: number; totalCount: number };
}

const RANGES = [7, 30, 90, 365];

function toResults(response: StatsResponse | null) {
  // Days before any goal existed have totalCount 0 — that's "no data", not a
  // missed day, so they're left out rather than plotted/colored as a failure.
  return (response?.daily ?? []).filter((s) => s.totalCount > 0);
}

export default function StatsPage() {
  const [trendDays, setTrendDays] = useState(30);
  const [trendData, setTrendData] = useState<StatsResponse | null>(null);
  // Independent of the Trend range selector: the heatmap always shows the
  // full 12 months, so switching "7T"/"30T" for the trend can't silently
  // shrink it to mostly-empty (see 2026-09-11 critique, "range selector
  // doesn't visibly affect the heatmap").
  const [heatmapData, setHeatmapData] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/stats?days=${trendDays}`).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Auswertung konnte nicht geladen werden.");
        return;
      }
      setError(null);
      setTrendData(await res.json());
    });
  }, [trendDays]);

  useEffect(() => {
    fetch("/api/stats?days=365").then((res) => (res.ok ? res.json() : null)).then((json) => {
      if (json) setHeatmapData(json);
    });
  }, []);

  const heatmapResults = toResults(heatmapData).map((s) => ({ date: s.date, success: s.successCount === s.totalCount }));
  const trendResults = toResults(trendData);
  const dailyPercents = trendResults.map((s) => ({ date: s.date, percent: (s.successCount / s.totalCount) * 100 }));
  const week = trendData?.week;
  const weekPercent = week && week.totalCount > 0 ? Math.round((week.successCount / week.totalCount) * 100) : null;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-3xl">Auswertung</h1>
        {week && (
          <div className="rounded-xl border bg-card px-4 py-2 text-right backdrop-blur-xl">
            <p className="font-mono text-xl tabular-nums text-primary">
              {weekPercent ?? 0}%
              <span className="ml-2 text-sm text-muted-foreground">
                ({week.successCount}/{week.totalCount})
              </span>
            </p>
            <p className="text-xs text-muted-foreground">diese Woche erreicht</p>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Gesamt-Heatmap (alle Ziele, letzte 12 Monate)</h2>
        <Heatmap results={heatmapResults} />
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Trend (Ziele pro Tag erreicht)</h2>
          <div className="inline-flex rounded-lg border bg-muted/50 p-1">
            {RANGES.map((d) => (
              <button
                key={d}
                onClick={() => setTrendDays(d)}
                className={`rounded-md px-3 py-1.5 font-mono text-sm transition-colors ${
                  d === trendDays ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {d}T
              </button>
            ))}
          </div>
        </div>
        <TrendChart dailyPercents={dailyPercents} />
      </section>
    </main>
  );
}
