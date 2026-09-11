"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Pencil, Trophy } from "lucide-react";
import { Heatmap } from "@/components/Heatmap";
import { TrendChart } from "@/components/TrendChart";
import { buttonVariants } from "@/components/ui/button";

interface HistoryResponse {
  goal: { title: string; icon: string | null };
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
      setError(null);
      setData(await res.json());
    });
  }, [params.id]);

  if (error) return <main className="px-6 py-10 text-destructive">{error}</main>;
  if (!data) return <main className="px-6 py-10 text-muted-foreground">Lädt…</main>;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="flex items-center gap-3 font-heading text-3xl">
          {data.goal.icon && <span className="text-2xl leading-none">{data.goal.icon}</span>}
          {data.goal.title}
        </h1>
        <Link href={`/goals/${params.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Pencil /> Bearbeiten
        </Link>
      </div>

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
        <ul className="space-y-2">
          {data.milestones.map((m, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border bg-card p-3 backdrop-blur-xl">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-celebrate/15 text-celebrate">
                <Trophy className="size-4" />
              </span>
              <p className="text-sm">
                {m.type === "streak" ? `${m.threshold}-Tage-Streak` : `${m.threshold}x insgesamt geschafft`}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
