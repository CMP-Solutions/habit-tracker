"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Heatmap } from "@/components/Heatmap";
import { TrendChart } from "@/components/TrendChart";

interface HistoryResponse {
  goal: { title: string };
  results: { date: string; success: boolean }[];
  milestones: { type: string; threshold: number; achievedAt: string }[];
}

export default function GoalDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/goals/${params.id}/history`).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Ziel nicht gefunden.");
        return;
      }
      setData(await res.json());
    });
  }, [params.id]);

  if (error) return <main className="p-6">{error}</main>;
  if (!data) return <main className="p-6">Lädt…</main>;

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">{data.goal.title}</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Letzte 12 Monate</h2>
        <Heatmap results={data.results} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Trend (7-Tage-Erfolgsquote)</h2>
        <TrendChart results={data.results} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Meilensteine</h2>
        {data.milestones.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Meilensteine.</p>}
        <ul className="space-y-1">
          {data.milestones.map((m, i) => (
            <li key={i} className="text-sm">
              🏆 {m.type === "streak" ? `${m.threshold}-Tage-Streak` : `${m.threshold}x insgesamt geschafft`}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
